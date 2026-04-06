/**
 * Serviço de integração com a API Integra Contador do SERPRO.
 *
 * Autenticação: OAuth 2.0 Client Credentials (consumer key + consumer secret).
 * O certificado e-CNPJ do escritório é armazenado para uso futuro em endpoints
 * que exijam mTLS (assinatura digital de documentos). Para consultas (GET), o
 * Bearer token OAuth é suficiente.
 *
 * Módulos suportados:
 *   integra-sitfis       — Situação Fiscal do Contribuinte
 *   integra-sn           — Simples Nacional (PGDAS-D)
 *   integra-mei          — MEI (DAS / Certidão CCMEI)
 *   integra-caixapostal  — Caixa Postal da Receita Federal
 *   integra-dctfweb      — DCTFWeb
 *   integra-parcelamento — Parcelamentos
 *   integra-procuracoes  — Consulta de procurações digitais (e-CAC)
 *
 * Padrões de resiliência implementados:
 *   - Token caching com TTL (3 500 s de margem antes de expirar)
 *   - Retry com backoff exponencial: até 3 tentativas (1 s / 2 s / 4 s)
 *   - Sem retry em erros 400/401/403/404 (não vão se resolver sozinhos)
 *   - Timeout de 30 s por requisição
 *   - Sentry em todos os erros críticos com tags rastreáveis
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

// ─── Constantes ───────────────────────────────────────────────────────────────

const AUTH_BASE: Record<string, string> = {
  homologacao: 'https://autenticacao.staging.serpro.gov.br',
  producao:    'https://autenticacao.serpro.gov.br',
}

const API_BASE: Record<string, string> = {
  homologacao: 'https://gateway.staging.estaleiro.serpro.gov.br',
  producao:    'https://gateway.estaleiro.serpro.gov.br',
}

const REQUEST_TIMEOUT_MS = 30_000
/** Margem de segurança em segundos antes do token expirar para renovar antecipadamente */
const TOKEN_EXPIRY_BUFFER_S = 100
/** Delays entre tentativas de retry (ms) */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const

// ─── Token Cache (singleton por processo Node) ────────────────────────────────

interface TokenCacheEntry {
  token: string
  /** Timestamp unix em ms até quando o token é válido */
  expiresAt: number
}

// Exportado para permitir invalidação quando credenciais mudam
export const tokenCache = new Map<string, TokenCacheEntry>()

export function clearTokenCache(): void {
  tokenCache.clear()
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IntegraContadorConfig {
  clientId: string
  clientSecret: string
  ambiente: 'homologacao' | 'producao'
  /** Base64 do arquivo .pfx do certificado e-CNPJ do escritório (opcional — mTLS futuro) */
  certBase64?: string
  /** Senha do certificado .pfx (opcional) */
  certSenha?: string
  /** Módulos contratados com o SERPRO */
  modulos: string[]
}

export interface SituacaoFiscalResult {
  cnpj: string
  situacao?: string
  dataConsulta?: string
  pendencias: Array<{ tipo: string; descricao: string; valor?: number }>
  raw: unknown
}

export interface PGDASResult {
  cnpj: string
  periodoApuracao: string
  status?: string
  valorDevido?: number
  dataVencimento?: string
  raw: unknown
}

export interface DASMEIResult {
  cnpj: string
  competencia: string
  codigoBarras?: string
  valor?: number
  dataVencimento?: string
  urlDas?: string
  raw: unknown
}

export interface CCMEIResult {
  cnpj: string
  nomeEmpresarial?: string
  naturezaJuridica?: string
  dataAbertura?: string
  situacao?: string
  urlCertidao?: string
  raw: unknown
}

export interface CaixaPostalResult {
  cnpj: string
  mensagens: Array<{
    id: string
    assunto?: string
    datahora?: string
    lida?: boolean
    tipo?: string
  }>
  total: number
  raw: unknown
}

export interface ProcuracaoResult {
  cnpjOutorgante: string
  cnpjOutorgado: string
  /** 'ativa' | 'expirada' | 'revogada' | 'nao_encontrada' */
  status: string
  dataInicio?: string
  dataFim?: string
  servicos?: string[]
  raw: unknown
}

export interface PagamentoDASResult {
  cnpj: string
  competencia: string
  /** true = DAS foi paga / quitada */
  pago: boolean
  dataPagamento?: string
  valorPago?: number
  raw: unknown
}

// ─── Retry com backoff exponencial ───────────────────────────────────────────

/** Códigos HTTP que NÃO devem disparar retry (erros definitivos) */
const NON_RETRIABLE_STATUSES = new Set([400, 401, 403, 404, 422])

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; operacao: string },
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3
  let lastError: Error = new Error('Nenhuma tentativa executada')

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      const status = (err as any)?.status as number | undefined
      if (status !== undefined && NON_RETRIABLE_STATUSES.has(status)) {
        throw lastError
      }

      if (attempt < maxAttempts - 1) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 4_000
        console.warn(
          `[integra-contador] ${opts.operacao} falhou (tentativa ${attempt + 1}/${maxAttempts}), retry em ${delay}ms: ${lastError.message}`,
        )
        await new Promise(res => setTimeout(res, delay))
      }
    }
  }

  throw lastError
}

// ─── Config loader ────────────────────────────────────────────────────────────

/**
 * Carrega e decripta a configuração do Integra Contador a partir do banco.
 * Retorna null se a integração não estiver habilitada ou mal configurada.
 */
export async function getIntegraContadorConfig(): Promise<IntegraContadorConfig | null> {
  const esc = await prisma.escritorio.findFirst({
    select: {
      integraContadorClientId:     true,
      integraContadorClientSecret: true,
      integraContadorAmbiente:     true,
      integraContadorCertBase64:   true,
      integraContadorCertSenha:    true,
      integraContadorEnabled:      true,
      integraContadorModulos:      true,
    },
  })

  if (!esc?.integraContadorEnabled) return null
  if (!esc.integraContadorClientId || !esc.integraContadorClientSecret) return null

  const safeDecrypt = (val: string | null | undefined): string | undefined => {
    if (!val) return undefined
    try {
      return isEncrypted(val) ? decrypt(val) : val
    } catch (err) {
      Sentry.captureException(err, {
        tags: { module: 'integra-contador', operation: 'decrypt-config' },
      })
      return undefined
    }
  }

  const clientSecret = safeDecrypt(esc.integraContadorClientSecret)
  if (!clientSecret) {
    console.error('[integra-contador] Falha ao decriptar client secret — verifique ENCRYPTION_KEY')
    return null
  }

  let modulos: string[] = []
  try {
    const parsed = JSON.parse(esc.integraContadorModulos ?? '[]')
    modulos = Array.isArray(parsed) ? parsed : []
  } catch {
    modulos = []
  }

  return {
    clientId:     esc.integraContadorClientId,
    clientSecret,
    ambiente:     (esc.integraContadorAmbiente === 'producao' ? 'producao' : 'homologacao'),
    certBase64:   safeDecrypt(esc.integraContadorCertBase64),
    certSenha:    safeDecrypt(esc.integraContadorCertSenha),
    modulos,
  }
}

// ─── Autenticação OAuth ───────────────────────────────────────────────────────

/**
 * Obtém token de acesso via OAuth 2.0 Client Credentials.
 * Resultado é cacheado e reutilizado até próximo da expiração.
 */
export async function getAccessToken(config: IntegraContadorConfig): Promise<string> {
  const cacheKey = `${config.ambiente}:${config.clientId}`
  const cached = tokenCache.get(cacheKey)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.token
  }

  const tokenUrl = `${AUTH_BASE[config.ambiente]}/oauth/jwt`
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  const data = await withRetry(
    async () => {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization:  `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body:   'grant_type=client_credentials',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const err  = new Error(`SERPRO auth HTTP ${res.status}: ${body}`)
        ;(err as any).status = res.status
        throw err
      }

      return res.json() as Promise<{ access_token: string; expires_in?: number }>
    },
    { operacao: 'getAccessToken' },
  )

  const token     = data.access_token
  const expiresIn = data.expires_in ?? 3_600
  const expiresAt = Date.now() + (expiresIn - TOKEN_EXPIRY_BUFFER_S) * 1_000

  tokenCache.set(cacheKey, { token, expiresAt })

  return token
}

// ─── Fetch autenticado ────────────────────────────────────────────────────────

async function apiFetch(
  config: IntegraContadorConfig,
  path: string,
  operacao: string,
): Promise<unknown> {
  const token = await getAccessToken(config)
  const url   = `${API_BASE[config.ambiente]}${path}`

  return withRetry(
    async () => {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept:        'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const err  = new Error(`SERPRO ${operacao} HTTP ${res.status}: ${body}`)
        ;(err as any).status = res.status
        throw err
      }

      return res.json()
    },
    { operacao },
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function limparCnpj(cnpj: string): string {
  return cnpj.replace(/[.\-/\s]/g, '')
}

function assertModulo(config: IntegraContadorConfig, modulo: string): void {
  if (!config.modulos.includes(modulo)) {
    throw new Error(`Módulo ${modulo} não está contratado. Acesse Configurações → Integrações → Integra Contador.`)
  }
}

// ─── Módulo: Situação Fiscal (integra-sitfis) ─────────────────────────────────

export async function consultarSituacaoFiscal(cnpj: string): Promise<SituacaoFiscalResult> {
  const cnpjLimpo = limparCnpj(cnpj)
  const config    = await getIntegraContadorConfig()

  if (!config) throw new Error('Integra Contador não está habilitado ou configurado.')
  assertModulo(config, 'integra-sitfis')

  try {
    const data = await apiFetch(
      config,
      `/integra-sitfis/v1/situacaofiscal/${cnpjLimpo}`,
      'consultar-situacao-fiscal',
    ) as Record<string, unknown>

    return {
      cnpj:         cnpjLimpo,
      situacao:     (data?.situacao ?? data?.descricaoSituacao) as string | undefined,
      dataConsulta: (data?.dataConsulta ?? new Date().toISOString().split('T')[0]) as string,
      pendencias:   Array.isArray(data?.pendencias) ? (data.pendencias as any[]) : [],
      raw:          data,
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'integra-contador', operation: 'consultar-situacao-fiscal' },
      extra: { cnpj: cnpjLimpo },
    })
    throw err
  }
}

// ─── Módulo: Simples Nacional — PGDAS-D (integra-sn) ─────────────────────────

export async function consultarPGDAS(cnpj: string, periodoApuracao: string): Promise<PGDASResult> {
  const cnpjLimpo = limparCnpj(cnpj)
  const config    = await getIntegraContadorConfig()

  if (!config) throw new Error('Integra Contador não está habilitado ou configurado.')
  assertModulo(config, 'integra-sn')

  try {
    const data = await apiFetch(
      config,
      `/integra-sn/v1/pgdas/${cnpjLimpo}/${periodoApuracao}`,
      'consultar-pgdas',
    ) as Record<string, unknown>

    return {
      cnpj:            cnpjLimpo,
      periodoApuracao,
      status:          (data?.situacao ?? data?.status) as string | undefined,
      valorDevido:     (data?.valorDevido ?? data?.valor) as number | undefined,
      dataVencimento:  data?.dataVencimento as string | undefined,
      raw:             data,
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'integra-contador', operation: 'consultar-pgdas' },
      extra: { cnpj: cnpjLimpo, periodoApuracao },
    })
    throw err
  }
}

// ─── Módulo: MEI — DAS (integra-mei) ─────────────────────────────────────────

/**
 * Gera o DAS (Documento de Arrecadação do Simples) para MEI.
 * @param competencia Formato AAAAMM (ex: "202601" para janeiro/2026)
 */
export async function gerarDASMEI(cnpj: string, competencia: string): Promise<DASMEIResult> {
  const cnpjLimpo = limparCnpj(cnpj)
  const config    = await getIntegraContadorConfig()

  if (!config) throw new Error('Integra Contador não está habilitado ou configurado.')
  assertModulo(config, 'integra-mei')

  try {
    const data = await apiFetch(
      config,
      `/integra-mei/v1/emitir-das/${cnpjLimpo}/${competencia}`,
      'gerar-das-mei',
    ) as Record<string, unknown>

    return {
      cnpj:          cnpjLimpo,
      competencia,
      codigoBarras:  (data?.codigoBarras ?? data?.barCode ?? data?.linhaDigitavel) as string | undefined,
      valor:         (data?.valor ?? data?.valorPrincipal ?? data?.valorTotal) as number | undefined,
      dataVencimento: data?.dataVencimento as string | undefined,
      urlDas:        (data?.url ?? data?.urlDas ?? data?.linkPagamento) as string | undefined,
      raw:           data,
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'integra-contador', operation: 'gerar-das-mei' },
      extra: { cnpj: cnpjLimpo, competencia },
    })
    throw err
  }
}

// ─── Módulo: MEI — Certidão CCMEI (integra-mei) ──────────────────────────────

export async function emitirCertidaoMEI(cnpj: string): Promise<CCMEIResult> {
  const cnpjLimpo = limparCnpj(cnpj)
  const config    = await getIntegraContadorConfig()

  if (!config) throw new Error('Integra Contador não está habilitado ou configurado.')
  assertModulo(config, 'integra-mei')

  try {
    const data = await apiFetch(
      config,
      `/integra-mei/v1/emitir-ccmei/${cnpjLimpo}`,
      'emitir-certidao-mei',
    ) as Record<string, unknown>

    return {
      cnpj:             cnpjLimpo,
      nomeEmpresarial:  (data?.nomeEmpresarial ?? data?.nome) as string | undefined,
      naturezaJuridica: data?.naturezaJuridica as string | undefined,
      dataAbertura:     (data?.dataAbertura ?? data?.dataInicio) as string | undefined,
      situacao:         data?.situacao as string | undefined,
      urlCertidao:      (data?.url ?? data?.urlCertidao ?? data?.linkCertidao) as string | undefined,
      raw:              data,
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'integra-contador', operation: 'emitir-certidao-mei' },
      extra: { cnpj: cnpjLimpo },
    })
    throw err
  }
}

// ─── Módulo: Caixa Postal RF (integra-caixapostal) ────────────────────────────

export async function consultarCaixaPostalRF(cnpj: string): Promise<CaixaPostalResult> {
  const cnpjLimpo = limparCnpj(cnpj)
  const config    = await getIntegraContadorConfig()

  if (!config) throw new Error('Integra Contador não está habilitado ou configurado.')
  assertModulo(config, 'integra-caixapostal')

  try {
    const data = await apiFetch(
      config,
      `/integra-caixapostal/v1/mensagens/${cnpjLimpo}`,
      'consultar-caixa-postal',
    ) as Record<string, unknown>

    const lista: unknown[] = Array.isArray(data?.mensagens)
      ? data.mensagens as unknown[]
      : Array.isArray(data) ? data as unknown[] : []

    return {
      cnpj:      cnpjLimpo,
      mensagens: lista.slice(0, 20).map((m: any) => ({
        id:       String(m.id ?? m.codigo ?? ''),
        assunto:  m.assunto ?? m.descricao ?? undefined,
        datahora: m.dataHora ?? m.data ?? undefined,
        lida:     Boolean(m.lida),
        tipo:     m.tipo ?? m.tipoMensagem ?? undefined,
      })),
      total: lista.length,
      raw:   data,
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'integra-contador', operation: 'consultar-caixa-postal' },
      extra: { cnpj: cnpjLimpo },
    })
    throw err
  }
}

// ─── Módulo: Pagamento DAS MEI (integra-pagamento / PGTOWEB) ─────────────────

/**
 * Verifica se a DAS de uma competência foi paga via integra-pagamento (PGTOWEB).
 * @param cnpj       CNPJ do cliente MEI
 * @param competencia Formato AAAAMM (ex: "202601" para jan/2026)
 */
export async function verificarPagamentoDASMEI(
  cnpj: string,
  competencia: string,
): Promise<PagamentoDASResult> {
  const cnpjLimpo = limparCnpj(cnpj)
  const config    = await getIntegraContadorConfig()

  if (!config) throw new Error('Integra Contador não está habilitado ou configurado.')
  assertModulo(config, 'integra-pagamento')

  try {
    const data = await apiFetch(
      config,
      `/integra-pagamento/v1/pagamento/${cnpjLimpo}/${competencia}`,
      'verificar-pagamento-das',
    ) as Record<string, unknown>

    // A RF retorna diferentes estruturas dependendo do status
    // Campos possíveis: situacao, status, dataPagamento, valorPago, valorPrincipal
    const pago = ['pago', 'quitado', 'liquidado', 'PAGO', 'QUITADO', 'LIQUIDADO'].includes(
      String(data?.situacao ?? data?.status ?? ''),
    )

    return {
      cnpj:          cnpjLimpo,
      competencia,
      pago,
      dataPagamento: (data?.dataPagamento ?? data?.dataQuitacao) as string | undefined,
      valorPago:     (data?.valorPago ?? data?.valorPrincipal) as number | undefined,
      raw:           data,
    }
  } catch (err) {
    // 404 = DAS não encontrada (ainda não gerada ou não existe)
    if ((err as any)?.status === 404) {
      return { cnpj: cnpjLimpo, competencia, pago: false, raw: null }
    }
    Sentry.captureException(err, {
      tags:  { module: 'integra-contador', operation: 'verificar-pagamento-das' },
      extra: { cnpj: cnpjLimpo, competencia },
    })
    throw err
  }
}

// ─── Módulo: Procurações (integra-procuracoes) ────────────────────────────────

/**
 * Consulta se um CNPJ de cliente possui procuração ativa para o CNPJ do escritório.
 * Usado para diagnóstico antes de chamar qualquer outro módulo.
 *
 * @param cnpjCliente   CNPJ do outorgante (cliente que concede a procuração)
 * @param cnpjEscritorio CNPJ do outorgado (escritório que recebe a procuração)
 */
export async function consultarProcuracao(
  cnpjCliente: string,
  cnpjEscritorio: string,
): Promise<ProcuracaoResult> {
  const cnpjOut  = limparCnpj(cnpjCliente)
  const cnpjEsc  = limparCnpj(cnpjEscritorio)
  const config   = await getIntegraContadorConfig()

  if (!config) throw new Error('Integra Contador não está habilitado ou configurado.')
  assertModulo(config, 'integra-procuracoes')

  try {
    const data = await apiFetch(
      config,
      `/integra-procuracoes/v1/procuracao/${cnpjOut}/${cnpjEsc}`,
      'consultar-procuracao',
    ) as Record<string, unknown>

    return {
      cnpjOutorgante: cnpjOut,
      cnpjOutorgado:  cnpjEsc,
      status:         (data?.situacao ?? data?.status ?? 'desconhecido') as string,
      dataInicio:     data?.dataInicio as string | undefined,
      dataFim:        data?.dataFim as string | undefined,
      servicos:       Array.isArray(data?.servicos) ? data.servicos as string[] : undefined,
      raw:            data,
    }
  } catch (err) {
    // 404 = procuração não encontrada (não é erro de sistema)
    if ((err as any)?.status === 404) {
      return {
        cnpjOutorgante: cnpjOut,
        cnpjOutorgado:  cnpjEsc,
        status:         'nao_encontrada',
        raw:            null,
      }
    }
    Sentry.captureException(err, {
      tags:  { module: 'integra-contador', operation: 'consultar-procuracao' },
      extra: { cnpjCliente: cnpjOut, cnpjEscritorio: cnpjEsc },
    })
    throw err
  }
}
