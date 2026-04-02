/**
 * Spedy API Client
 * Plataforma de automação fiscal brasileira — emissão de NFS-e
 * Docs: https://api.spedy.com.br/v1
 */

import * as Sentry from '@sentry/nextjs'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { logger } from '@/lib/logger'

// ─── Ambiente ─────────────────────────────────────────────────────────────────

const SPEDY_BASE_PROD    = 'https://api.spedy.com.br/v1'
const SPEDY_BASE_SANDBOX = 'https://sandbox-api.spedy.com.br/v1'

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export interface SpedyCidade {
  id: string
  code: string
  name: string
  state: string
  provider: {
    name: string
    options: {
      rps: boolean
      series: boolean
      batchNumber: boolean
      invoiceNumber: boolean
      requiresNumberInSequence: boolean
      federalServiceCode: boolean
      nbsCode: boolean
      supportsTaxReform: boolean
      useNationalLayout: boolean
      authentication: string
    }
  }
  nationalServiceInvoiceRegimes?: string | null
}

export interface SpedyEnderecoInput {
  street?: string
  number?: string
  district?: string
  postalCode?: string
  additionalInformation?: string
  city: { code?: string; name?: string; state?: string }
}

export interface SpedyReceiverInput {
  name: string
  federalTaxNumber: string  // CPF (11) ou CNPJ (14) — somente números
  email?: string
  address?: SpedyEnderecoInput
}

export interface SpedyTotalNfseInput {
  invoiceAmount: number
  issRate?: number
  issAmount?: number
  issWithheld?: boolean
  pisRate?: number
  pisAmount?: number
  pisWithheld?: boolean
  cofinsRate?: number
  cofinsAmount?: number
  cofinsWithheld?: boolean
  irRate?: number
  irAmount?: number
  irWithheld?: boolean
  netAmount?: number
}

export interface EmissaoNfseInput {
  integrationId?: string        // nosso ID — garante idempotência
  effectiveDate: string         // ISO 8601
  status?: 'enqueued'
  sendEmailToCustomer?: boolean
  description: string
  federalServiceCode?: string   // LC 116/03
  cityServiceCode?: string      // código municipal
  nbsCode?: string
  taxationType: string
  receiver: SpedyReceiverInput
  total: SpedyTotalNfseInput
}

export interface SpedyProcessingDetail {
  status: 'processing' | 'success' | 'failed'
  message: string | null
  code: string | null
}

export interface SpedyNfse {
  id: string
  integrationId?: string
  status: string  // enqueued | authorized | rejected | canceled | ...
  model: string
  environmentType: string
  number: number | null
  issuedOn: string | null
  amount: number
  description?: string
  rps?: { number: number; series: string }
  authorization?: { date: string; protocol: string }
  processingDetail: SpedyProcessingDetail
  receiver?: { name: string; federalTaxNumber: string; email?: string }
  company?: { name: string; federalTaxNumber: string }
}

export interface SpedyWebhook {
  id: string
  event: string
  url: string
  enabled: boolean
}

export interface SpedyWebhookPayload {
  id: string
  event: string
  data: SpedyNfse & {
    company?: { name: string; federalTaxNumber: string }
    order?: { id: string; date: string; transactionId?: string }
  }
}

export interface SpedyEmpresa {
  id: string
  name: string
  legalName: string
  federalTaxNumber: string
  taxRegime: string
  apiCredentials: { apiKey: string }
}

export interface CriarEmpresaSpedyInput {
  name: string
  legalName: string
  federalTaxNumber: string  // CNPJ — 14 dígitos sem máscara
  email?: string
  phone?: string
  address?: SpedyEnderecoInput
  taxRegime: 'simplesNacional' | 'simplesNacionalExcessoSublimite' | 'simplesNacionalMEI' | 'regimeNormal'
  economicActivities?: Array<{ code: string; isMain: boolean }>
}

// ─── Retry helpers ────────────────────────────────────────────────────────────

const RETRY_MAX        = 3    // tentativas totais (1 inicial + 2 retries)
const RETRY_BASE_MS    = 500  // base do backoff exponencial
const RETRY_JITTER_MAX = 200  // jitter aleatório máximo (ms)

/** Retorna true se o statusCode merece nova tentativa */
function deveRetry(status: number): boolean {
  return status === 0       // erro de rede / timeout
    || status === 429       // rate limit
    || status >= 500        // erro do servidor Spedy
}

/** Tempo de espera (ms) para a tentativa N (1-based) com jitter */
function calcDelay(attempt: number, rateLimitReset?: string | null): number {
  if (rateLimitReset) {
    const resetMs = parseInt(rateLimitReset, 10) * 1000 - Date.now()
    if (resetMs > 0 && resetMs < 30_000) return resetMs + 200
  }
  const base  = RETRY_BASE_MS * Math.pow(3, attempt - 1)   // 500, 1500, 4500
  const jitter = Math.floor(Math.random() * RETRY_JITTER_MAX)
  return base + jitter
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class SpedyClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(apiKey: string, ambiente: 'sandbox' | 'producao' = 'sandbox') {
    const raw = isEncrypted(apiKey) ? decrypt(apiKey) : apiKey
    this.apiKey  = raw
    this.baseUrl = ambiente === 'producao' ? SPEDY_BASE_PROD : SPEDY_BASE_SANDBOX
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'X-Api-Key':    this.apiKey,
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    }

    let lastError: SpedyError | null = null

    for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
      let response: Response | null = null

      try {
        response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        })
      } catch (err) {
        // Erro de rede / DNS / timeout
        logger.error('spedy-fetch-error', { method, path, attempt, err })
        lastError = new SpedyError('Erro de conexão com a Spedy', 0)

        if (attempt < RETRY_MAX) {
          const delay = calcDelay(attempt)
          logger.warn('spedy-retry', { method, path, attempt, delayMs: delay, motivo: 'network_error' })
          await sleep(delay)
          continue
        }

        // Esgotou tentativas — reporta ao Sentry e lança
        Sentry.captureException(lastError, {
          tags: { module: 'spedy-client', operation: `${method} ${path}` },
          extra: { attempt, method, path },
        })
        throw lastError
      }

      // 403 — chave inválida: sem retry, erro imediato
      if (response.status === 403) {
        throw new SpedyError('Chave de API inválida ou sem permissão', 403)
      }

      // 204 No Content (ex: cancelamento bem-sucedido)
      if (response.status === 204) return undefined as T

      // Recupera o corpo para erros ou sucesso
      const text = await response.text()
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        logger.error('spedy-parse-error', { status: response.status, body: text.slice(0, 200) })
        lastError = new SpedyError(`Resposta inválida da Spedy (${response.status})`, response.status)

        if (attempt < RETRY_MAX && deveRetry(response.status)) {
          const delay = calcDelay(attempt)
          logger.warn('spedy-retry', { method, path, attempt, delayMs: delay, motivo: 'parse_error' })
          await sleep(delay)
          continue
        }
        throw lastError
      }

      // Resposta bem-sucedida
      if (response.ok) return json as T

      // Erro de negócio da Spedy — monta a mensagem
      const errors = (json as { errors?: Array<{ message: string }> })?.errors
      const msg    = errors?.[0]?.message ?? `Erro HTTP ${response.status}`

      // 429 rate-limit: respeita o header reset-at
      if (response.status === 429) {
        const reset = response.headers.get('x-rate-limit-reset')
        logger.warn('spedy-rate-limit', { reset, attempt })
        lastError = new SpedyError('Rate limit atingido na Spedy', 429, json)

        if (attempt < RETRY_MAX) {
          const delay = calcDelay(attempt, reset)
          logger.warn('spedy-retry', { method, path, attempt, delayMs: delay, motivo: 'rate_limit' })
          await sleep(delay)
          continue
        }
        Sentry.captureException(lastError, {
          tags: { module: 'spedy-client', operation: `${method} ${path}` },
          extra: { attempt },
        })
        throw lastError
      }

      // 5xx — erro do servidor Spedy: retry
      if (response.status >= 500) {
        logger.error('spedy-server-error', { method, path, status: response.status, msg, attempt })
        lastError = new SpedyError(msg, response.status, json)

        if (attempt < RETRY_MAX) {
          const delay = calcDelay(attempt)
          logger.warn('spedy-retry', { method, path, attempt, delayMs: delay, motivo: `http_${response.status}` })
          await sleep(delay)
          continue
        }

        Sentry.captureException(lastError, {
          tags: { module: 'spedy-client', operation: `${method} ${path}` },
          extra: { attempt, status: response.status },
        })
        throw lastError
      }

      // 4xx (exceto 403/429) — erro de dados: sem retry
      logger.error('spedy-api-error', { method, path, status: response.status, msg })
      throw new SpedyError(msg, response.status, json)
    }

    // Nunca alcançado — garante tipagem
    throw lastError ?? new SpedyError('Erro desconhecido na Spedy', 0)
  }

  // ─── NFS-e ────────────────────────────────────────────────────────────────

  async emitirNfse(input: EmissaoNfseInput): Promise<SpedyNfse> {
    return this.request<SpedyNfse>('POST', '/service-invoices', {
      ...input,
      status: 'enqueued',
    })
  }

  async consultarNfse(id: string): Promise<SpedyNfse> {
    return this.request<SpedyNfse>('GET', `/service-invoices/${id}`)
  }

  async cancelarNfse(id: string, justificativa: string): Promise<void> {
    await this.request('DELETE', `/service-invoices/${id}`, {
      justification: justificativa,
    })
  }

  async reemitirNfse(id: string): Promise<void> {
    await this.request('POST', `/service-invoices/${id}/issue`)
  }

  async consultarStatusNfsePrefeitura(id: string): Promise<SpedyNfse> {
    return this.request<SpedyNfse>('POST', `/service-invoices/${id}/check-status`)
  }

  async reenviarEmailNfse(id: string): Promise<void> {
    await this.request('POST', `/service-invoices/${id}/resend-email`)
  }

  /** URL pública do PDF — não exige X-Api-Key para download */
  pdfUrl(id: string): string {
    return `${this.baseUrl}/service-invoices/${id}/pdf`
  }

  /** URL pública do XML — não exige X-Api-Key para download */
  xmlUrl(id: string): string {
    return `${this.baseUrl}/service-invoices/${id}/xml`
  }

  // ─── Municípios ───────────────────────────────────────────────────────────

  async listarMunicipios(params?: {
    code?: string
    state?: string
    page?: number
    pageSize?: number
  }): Promise<{ items: SpedyCidade[]; totalCount: number; hasNext: boolean }> {
    const qs = new URLSearchParams()
    if (params?.code)     qs.set('code', params.code)
    if (params?.state)    qs.set('state', params.state)
    if (params?.page)     qs.set('page', String(params.page))
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize))
    const query = qs.toString() ? `?${qs}` : ''
    return this.request('GET', '/service-invoices/cities' + query)
  }

  async verificarMunicipio(codigoIbge: string): Promise<SpedyCidade | null> {
    try {
      const res = await this.listarMunicipios({ code: codigoIbge, pageSize: 1 })
      return res.items[0] ?? null
    } catch {
      return null
    }
  }

  // ─── Empresas (Owner only) ────────────────────────────────────────────────

  async criarEmpresa(input: CriarEmpresaSpedyInput): Promise<SpedyEmpresa> {
    return this.request<SpedyEmpresa>('POST', '/companies', input)
  }

  async atualizarEmpresa(companyId: string, input: Partial<CriarEmpresaSpedyInput>): Promise<SpedyEmpresa> {
    return this.request<SpedyEmpresa>('PUT', `/companies/${companyId}`, input)
  }

  async listarEmpresas(): Promise<{ items: SpedyEmpresa[] }> {
    return this.request('GET', '/companies')
  }

  // ─── Webhooks ─────────────────────────────────────────────────────────────

  async criarWebhook(url: string): Promise<SpedyWebhook> {
    return this.request<SpedyWebhook>('POST', '/webhooks', {
      event: 'invoice.status_changed',
      url,
    })
  }

  async reativarWebhook(id: string): Promise<void> {
    await this.request('PUT', `/webhooks/${id}/enable`)
  }

  async desativarWebhook(id: string): Promise<void> {
    await this.request('PUT', `/webhooks/${id}/disable`)
  }

  async listarWebhooks(): Promise<{ items: SpedyWebhook[] }> {
    return this.request('GET', '/webhooks')
  }

  // ─── Teste de conexão ────────────────────────────────────────────────────

  async testarConexao(): Promise<boolean> {
    try {
      await this.listarMunicipios({ pageSize: 1 })
      return true
    } catch {
      return false
    }
  }
}

// ─── Classe de erro ───────────────────────────────────────────────────────────

export class SpedyError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'SpedyError'
  }

  /** Código SPD = rejeição da validação Spedy (não da SEFAZ/Prefeitura) */
  get isSpedyValidation(): boolean {
    const code = (this.body as { errors?: Array<{ message: string }> })
      ?.errors?.[0]?.message
    return typeof code === 'string' && code.startsWith('SPD')
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Cria um SpedyClient para o ESCRITÓRIO (Owner key — gerencia empresas secundárias)
 */
export function getSpedyOwnerClient(config: {
  spedyApiKey: string
  spedyAmbiente?: string | null
}): SpedyClient {
  const ambiente = config.spedyAmbiente === 'producao' ? 'producao' : 'sandbox'
  return new SpedyClient(config.spedyApiKey, ambiente as 'sandbox' | 'producao')
}

/**
 * URL pública do PDF de uma NFS-e sem precisar instanciar SpedyClient.
 * Útil para download de cópia em background (não requer API key).
 */
export function spedyPdfUrl(spedyId: string, ambiente?: string | null): string {
  const base = ambiente === 'producao' ? SPEDY_BASE_PROD : SPEDY_BASE_SANDBOX
  return `${base}/service-invoices/${spedyId}/pdf`
}

/**
 * URL pública do XML de uma NFS-e sem precisar instanciar SpedyClient.
 */
export function spedyXmlUrl(spedyId: string, ambiente?: string | null): string {
  const base = ambiente === 'producao' ? SPEDY_BASE_PROD : SPEDY_BASE_SANDBOX
  return `${base}/service-invoices/${spedyId}/xml`
}

/**
 * Cria um SpedyClient para uma EMPRESA CLIENTE (chave da empresa secundária)
 * Usa para emissão de NFS-e em nome do cliente
 */
export function getSpedyClienteClient(params: {
  spedyApiKey: string
  spedyAmbiente?: string | null
}): SpedyClient {
  const ambiente = params.spedyAmbiente === 'producao' ? 'producao' : 'sandbox'
  return new SpedyClient(params.spedyApiKey, ambiente as 'sandbox' | 'producao')
}
