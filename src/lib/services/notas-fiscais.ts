/**
 * Service layer — Notas Fiscais (NFS-e via Spedy)
 *
 * Fluxo principal:
 *   1. emitirNotaFiscal()  → monta payload, cria registro, envia à Spedy
 *   2. processarWebhookSpedy() → atualiza status ao receber evento
 *   3. onNotaAutorizada()  → indexa RAG, cria Documento, entrega ao cliente
 *   4. onNotaRejeitada()   → notifica equipe com diagnóstico
 */

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt, isEncrypted } from '@/lib/crypto'
import { getSpedyClienteClient, getSpedyOwnerClient, SpedyError, type EmissaoNfseInput, type SpedyWebhookPayload } from '@/lib/spedy'
import { registrarInteracao } from '@/lib/services/interacoes'
import { logger } from '@/lib/logger'
import { sendText } from '@/lib/evolution'
import type { EvolutionConfig } from '@/lib/evolution'
import type { StatusNotaFiscal } from '@prisma/client'

// ─── Config do escritório (leitura direta — não usa cache para API keys) ──────

const SPEDY_CONFIG_DEFAULTS = {
  spedyApiKey:            null as string | null,
  spedyAmbiente:          'sandbox' as string | null,
  spedyIssAliquota:       null as unknown,
  spedyIssWithheld:       false as boolean | null,
  spedyFederalServiceCode: null as string | null,
  spedyCityServiceCode:   null as string | null,
  spedyTaxationType:      null as string | null,
  spedyEnviarAoAutorizar: true  as boolean | null,
  spedyEnviarCanalPadrao: 'whatsapp' as string | null,
  evolutionApiKey:        null as string | null,
  evolutionApiUrl:        null as string | null,
  evolutionInstance:      null as string | null,
}

async function getEscritorioSpedy() {
  const row = await prisma.escritorio.findFirst({
    select: {
      spedyApiKey:            true,
      spedyAmbiente:          true,
      spedyIssAliquota:       true,
      spedyIssWithheld:       true,
      spedyFederalServiceCode: true,
      spedyCityServiceCode:   true,
      spedyTaxationType:      true,
      spedyEnviarAoAutorizar: true,
      spedyEnviarCanalPadrao: true,
      evolutionApiKey:        true,
      evolutionApiUrl:        true,
      evolutionInstance:      true,
    },
  })
  return row ?? SPEDY_CONFIG_DEFAULTS
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface EmitirNotaInput {
  clienteId: string
  ordemServicoId?: string
  descricao: string
  valor: number                  // valor total em reais
  tomadorNome: string
  tomadorCpfCnpj: string        // somente números (CPF 11 ou CNPJ 14)
  tomadorEmail?: string
  tomadorMunicipio?: string
  tomadorEstado?: string
  // Overrides fiscais (usa defaults do Escritório/Empresa se não informado)
  issAliquota?: number
  issRetido?: boolean
  federalServiceCode?: string
  cityServiceCode?: string
  taxationType?: string
  emitidaPorId?: string          // null = agente/automático
}

export interface EmitirNotaResult {
  sucesso: true
  notaFiscalId: string
  status: StatusNotaFiscal
  mensagem: string
}

export interface EmitirNotaErro {
  sucesso: false
  motivo: 'nao_configurado' | 'municipio_nao_integrado' | 'dados_incompletos' | 'erro_spedy' | 'erro_interno'
  detalhe: string
}

export type EmitirNotaOutput = EmitirNotaResult | EmitirNotaErro

// ─── Helpers ──────────────────────────────────────────────────────────────────

function soNumeros(v: string): string {
  return v.replace(/\D/g, '')
}

function isCpf(cpfCnpj: string): boolean {
  return soNumeros(cpfCnpj).length === 11
}

async function getClienteComEmpresa(clienteId: string) {
  return prisma.cliente.findUnique({
    where: { id: clienteId },
    include: {
      empresa: true,
    },
  })
}

/** Retorna a API key da empresa cliente (decriptada) ou null */
function getClienteSpedyKey(empresa: { spedyApiKey?: string | null }): string | null {
  if (!empresa.spedyApiKey) return null
  try {
    return isEncrypted(empresa.spedyApiKey) ? decrypt(empresa.spedyApiKey) : empresa.spedyApiKey
  } catch {
    return null
  }
}

/** Monta a URL do webhook baseada na API key do escritório para segurança via token no path */
export function montarWebhookUrl(spedyApiKey: string): string {
  const { createHash } = require('crypto')
  const raw = isEncrypted(spedyApiKey) ? decrypt(spedyApiKey) : spedyApiKey
  const token = createHash('sha256').update(raw).digest('hex').slice(0, 32)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://app.avos.com.br'
  return `${baseUrl}/api/webhooks/spedy/${token}`
}

// ─── Sincronização de empresa na Spedy ───────────────────────────────────────

function mapRegimeToSpedy(regime: string | null | undefined): 'simplesNacional' | 'simplesNacionalMEI' | 'simplesNacionalExcessoSublimite' | 'regimeNormal' {
  if (regime === 'MEI')             return 'simplesNacionalMEI'
  if (regime === 'SimplesNacional') return 'simplesNacional'
  return 'regimeNormal'
}

export async function sincronizarEmpresaNaSpedy(empresaId: string): Promise<{
  sucesso: boolean
  acao: 'criada' | 'atualizada' | 'noop'
  detalhe?: string
}> {
  const empresa = await prisma.empresa.findUnique({
    where:   { id: empresaId },
    include: { cliente: { select: { nome: true } } },
  })

  if (!empresa) return { sucesso: false, acao: 'noop', detalhe: 'Empresa não encontrada' }
  if (!empresa.cnpj) return { sucesso: false, acao: 'noop', detalhe: 'Empresa sem CNPJ cadastrado' }

  const escritorio = await prisma.escritorio.findFirst({
    select: { spedyApiKey: true, spedyAmbiente: true },
  })
  if (!escritorio?.spedyApiKey) {
    return { sucesso: false, acao: 'noop', detalhe: 'Conta Owner da Spedy não configurada' }
  }

  const ownerClient = getSpedyOwnerClient({
    spedyApiKey:   escritorio.spedyApiKey,
    spedyAmbiente: escritorio.spedyAmbiente,
  })

  const taxRegime  = mapRegimeToSpedy(empresa.regime)
  const name       = empresa.nomeFantasia ?? empresa.razaoSocial ?? empresa.cliente?.nome ?? ''
  const legalName  = empresa.razaoSocial  ?? empresa.cliente?.nome ?? ''
  const cnpj       = empresa.cnpj.replace(/\D/g, '')

  try {
    // Atualização: empresa já existe na Spedy
    if (empresa.spedyCompanyId) {
      await ownerClient.atualizarEmpresa(empresa.spedyCompanyId, { name, legalName, taxRegime })
      await prisma.empresa.update({
        where: { id: empresaId },
        data:  { spedyConfigurado: true, spedyConfiguradoEm: new Date() },
      })
      logger.info('spedy-empresa-atualizada', { empresaId, spedyCompanyId: empresa.spedyCompanyId })
      return { sucesso: true, acao: 'atualizada' }
    }

    // Criação: registra empresa na Spedy pela primeira vez
    const spedyEmpresa = await ownerClient.criarEmpresa({ name, legalName, federalTaxNumber: cnpj, taxRegime })
    const apiKeyEncrypted = encrypt(spedyEmpresa.apiCredentials.apiKey)

    await prisma.empresa.update({
      where: { id: empresaId },
      data:  {
        spedyCompanyId:     spedyEmpresa.id,
        spedyApiKey:        apiKeyEncrypted,
        spedyConfigurado:   true,
        spedyConfiguradoEm: new Date(),
      },
    })
    logger.info('spedy-empresa-criada', { empresaId, spedyCompanyId: spedyEmpresa.id })
    return { sucesso: true, acao: 'criada' }

  } catch (err) {
    logger.error('spedy-sincronizar-empresa-falhou', { empresaId, err })
    const detalhe = err instanceof Error ? err.message : 'Erro ao sincronizar com a Spedy'
    return { sucesso: false, acao: 'noop', detalhe }
  }
}

// ─── Verificação de configuração ──────────────────────────────────────────────

export async function verificarConfiguracaoNfse(clienteId: string): Promise<{
  configurado: boolean
  municipioIntegrado: boolean | null  // null = não verificado (cliente sem cidade)
  motivos: string[]
  empresaId?: string
}> {
  const cliente = await getClienteComEmpresa(clienteId)
  if (!cliente) {
    return { configurado: false, municipioIntegrado: null, motivos: ['Cliente não encontrado'] }
  }

  const motivos: string[] = []

  // Verifica se tem empresa vinculada com Spedy configurado
  if (!cliente.empresa) {
    motivos.push('Cliente não possui empresa vinculada')
  } else if (!cliente.empresa.spedyConfigurado || !cliente.empresa.spedyApiKey) {
    motivos.push('Empresa não está configurada para emissão de NFS-e')
  }

  if (motivos.length > 0) {
    return { configurado: false, municipioIntegrado: null, motivos }
  }

  const empresa = cliente.empresa!

  // Verifica se o município do cliente está integrado
  let municipioIntegrado: boolean | null = null
  if (cliente.cidade && cliente.uf) {
    try {
      const config = await getEscritorioSpedy()
      if (config.spedyApiKey) {
        const spedyKey = getClienteSpedyKey(empresa) ?? ''
        const ambiente = config.spedyAmbiente === 'producao' ? 'producao' : 'sandbox'
        const client = getSpedyClienteClient({ spedyApiKey: spedyKey, spedyAmbiente: ambiente })
        const nomeNormalizado = cliente.cidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        // Pagina por todas as páginas — estados como SP/MG têm 600+ municípios
        let page = 1
        let found = false
        let hasNext = true
        while (hasNext && !found) {
          const res = await client.listarMunicipios({ state: cliente.uf, page, pageSize: 200 })
          found = res.items.some(m =>
            m.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === nomeNormalizado
            && m.state === cliente.uf
          )
          hasNext = res.hasNext
          page++
        }
        municipioIntegrado = found
        if (!municipioIntegrado) {
          motivos.push(`Município ${cliente.cidade}/${cliente.uf} não está integrado na Spedy`)
        }
      }
    } catch (err) {
      logger.warn('spedy-verificar-municipio-falhou', { clienteId, err })
      // Não bloqueia — deixa tentar emitir
    }
  }

  return {
    configurado: motivos.length === 0,
    municipioIntegrado,
    motivos,
    empresaId: empresa.id,
  }
}

// ─── Emissão ──────────────────────────────────────────────────────────────────

export async function emitirNotaFiscal(input: EmitirNotaInput): Promise<EmitirNotaOutput> {
  const { clienteId, ordemServicoId, descricao, valor, tomadorNome, tomadorCpfCnpj } = input

  // 1. Busca cliente + empresa
  const cliente = await getClienteComEmpresa(clienteId)
  if (!cliente) {
    return { sucesso: false, motivo: 'dados_incompletos', detalhe: 'Cliente não encontrado.' }
  }

  const empresa = cliente.empresa
  if (!empresa?.spedyConfigurado || !empresa?.spedyApiKey) {
    return {
      sucesso: false,
      motivo: 'nao_configurado',
      detalhe: `Empresa "${empresa?.razaoSocial ?? cliente.nome}" não está configurada para emissão de NFS-e. Acesse Configurações > Nota Fiscal para configurar.`,
    }
  }

  // 2. Busca config do escritório para defaults
  const config = await getEscritorioSpedy()

  // 3. Resolve defaults fiscais (empresa > escritório)
  const issAliquota       = input.issAliquota       ?? Number(empresa.spedyIssAliquota)    ?? Number(config.spedyIssAliquota)    ?? 0.05
  const issRetido         = input.issRetido         ?? empresa.spedyIssWithheld             ?? config.spedyIssWithheld            ?? false
  const federalServiceCode = input.federalServiceCode ?? empresa.spedyFederalServiceCode   ?? config.spedyFederalServiceCode     ?? ''
  const cityServiceCode    = input.cityServiceCode    ?? empresa.spedyCityServiceCode       ?? config.spedyCityServiceCode        ?? ''
  const taxationType       = input.taxationType       ?? empresa.spedyTaxationType          ?? config.spedyTaxationType           ?? 'taxationInMunicipality'

  const cpfCnpjLimpo = soNumeros(tomadorCpfCnpj)
  const issValor     = Math.round(valor * issAliquota * 100) / 100
  const valorLiquido = issRetido ? Math.round((valor - issValor) * 100) / 100 : valor

  // 4. Cria registro local — integrationId sempre único para não colidir com reemissões
  // (reemissões reutilizam o integrationId da nota original via reemitirNotaFiscal)
  const integrationId = `nf-${clienteId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const notaLocal = await prisma.notaFiscal.create({
    data: {
      clienteId,
      empresaId:       empresa.id,
      ordemServicoId:  ordemServicoId ?? null,
      emitidaPorId:    input.emitidaPorId ?? null,
      integrationId,
      status:          'enviando',
      descricao,
      valorTotal:      valor,
      issRetido,
      issAliquota,
      issValor:        issValor > 0 ? issValor : null,
      valorLiquido,
      federalServiceCode,
      cityServiceCode,
      taxationType,
      tomadorNome,
      tomadorCpfCnpj:  cpfCnpjLimpo,
      tomadorEmail:    input.tomadorEmail ?? null,
      tomadorMunicipio: input.tomadorMunicipio ?? null,
      tomadorEstado:   input.tomadorEstado ?? null,
      atualizadoEm:    new Date(),
    },
  })

  // 5. Monta payload e emite na Spedy
  try {
    const spedyKey = getClienteSpedyKey(empresa)!
    const ambiente = config.spedyAmbiente === 'producao' ? 'producao' : 'sandbox'
    const spedyClient = getSpedyClienteClient({ spedyApiKey: spedyKey, spedyAmbiente: ambiente })

    const payload: EmissaoNfseInput = {
      integrationId,
      effectiveDate: new Date().toISOString(),
      status:        'enqueued',
      sendEmailToCustomer: !!input.tomadorEmail,
      description:   descricao,
      federalServiceCode: federalServiceCode || undefined,
      cityServiceCode:    cityServiceCode    || undefined,
      taxationType,
      receiver: {
        name:            tomadorNome,
        federalTaxNumber: cpfCnpjLimpo,
        email:           input.tomadorEmail,
        address: (input.tomadorMunicipio && input.tomadorEstado) ? {
          city: { name: input.tomadorMunicipio, state: input.tomadorEstado },
        } : undefined,
      },
      total: {
        invoiceAmount: valor,
        issRate:       issAliquota,
        issAmount:     issValor > 0 ? issValor : undefined,
        issWithheld:   issRetido,
        netAmount:     valorLiquido !== valor ? valorLiquido : undefined,
      },
    }

    const nfse = await spedyClient.emitirNfse(payload)

    // 6. Atualiza com ID da Spedy e status enqueued/processando
    const statusMapeado: StatusNotaFiscal =
      nfse.status === 'authorized' ? 'autorizada'
      : nfse.status === 'rejected' ? 'rejeitada'
      : nfse.status === 'canceled' ? 'cancelada'
      : 'processando'

    await prisma.notaFiscal.update({
      where: { id: notaLocal.id },
      data: {
        spedyId:    nfse.id,
        status:     statusMapeado,
        rpsNumero:  nfse.rps?.number ?? null,
        rpsSerie:   nfse.rps?.series ?? null,
        atualizadoEm: new Date(),
      },
    })

    // Se já autorizado de forma síncrona (raro), processa imediatamente
    if (statusMapeado === 'autorizada') {
      await onNotaAutorizada({ ...notaLocal, spedyId: nfse.id, numero: nfse.number ?? null })
    }

    return {
      sucesso: true,
      notaFiscalId: notaLocal.id,
      status: statusMapeado,
      mensagem: `NFS-e enviada para processamento. ${nfse.rps ? `RPS nº ${nfse.rps.number}.` : ''} Aguardando autorização da prefeitura.`,
    }

  } catch (err) {
    logger.error('spedy-emissao-falhou', { notaId: notaLocal.id, err })

    const msg = err instanceof SpedyError ? err.message : 'Erro interno ao comunicar com a Spedy'
    const motivo: EmitirNotaErro['motivo'] = err instanceof SpedyError ? 'erro_spedy' : 'erro_interno'

    await prisma.notaFiscal.update({
      where:  { id: notaLocal.id },
      data:   { status: 'erro_interno', erroMensagem: msg, tentativas: 1, atualizadoEm: new Date() },
    })

    return { sucesso: false, motivo, detalhe: msg }
  }
}

// ─── Processamento de Webhook ─────────────────────────────────────────────────

export async function processarWebhookSpedy(payload: SpedyWebhookPayload): Promise<void> {
  const { event, data } = payload

  if (!data?.id) {
    logger.warn('spedy-webhook-sem-id', { event })
    return
  }

  const nota = await prisma.notaFiscal.findUnique({
    where: { spedyId: data.id },
  })

  if (!nota) {
    // Pode ser de uma nota criada no backoffice diretamente — ignorar
    logger.info('spedy-webhook-nota-nao-encontrada', { spedyId: data.id, event })
    return
  }

  const statusMapeado: StatusNotaFiscal =
    data.status === 'authorized' ? 'autorizada'
    : data.status === 'rejected' ? 'rejeitada'
    : data.status === 'canceled' ? 'cancelada'
    : 'processando'

  const updateData: Record<string, unknown> = {
    status:      statusMapeado,
    atualizadoEm: new Date(),
  }

  if (data.status === 'authorized') {
    updateData.numero      = data.number ?? null
    updateData.protocolo   = data.authorization?.protocol ?? null
    updateData.autorizadaEm = data.authorization?.date ? new Date(data.authorization.date) : new Date()
    updateData.erroCodigo  = null
    updateData.erroMensagem = null
    updateData.pdfUrl      = null  // será construído via proxy com o spedyId
    updateData.xmlUrl      = null
  }

  if (data.status === 'rejected') {
    updateData.erroCodigo   = data.processingDetail?.code  ?? null
    updateData.erroMensagem = data.processingDetail?.message ?? 'Nota rejeitada'
    const tentativas = (nota.tentativas ?? 0) + 1
    updateData.tentativas   = tentativas
  }

  if (data.status === 'canceled') {
    updateData.canceladaEm = new Date()
  }

  const notaAtualizada = await prisma.notaFiscal.update({
    where: { id: nota.id },
    data:  updateData as never,
  })

  // Ações pós-status
  if (statusMapeado === 'autorizada') {
    await onNotaAutorizada(notaAtualizada).catch(err =>
      logger.error('spedy-pos-autorizacao-falhou', { notaId: nota.id, err })
    )
  }

  if (statusMapeado === 'rejeitada') {
    await onNotaRejeitada(notaAtualizada).catch(err =>
      logger.error('spedy-pos-rejeicao-falhou', { notaId: nota.id, err })
    )
  }
}

// ─── Pós-autorização ──────────────────────────────────────────────────────────

export async function onNotaAutorizada(nota: {
  id: string
  clienteId: string
  empresaId?: string | null
  ordemServicoId?: string | null
  numero?: number | null
  valorTotal: unknown
  descricao: string
  tomadorNome?: string | null
  autorizadaEm?: Date | null
  protocolo?: string | null
  spedyId?: string | null
  issValor?: unknown
  issRetido?: boolean
}): Promise<void> {
  const [cliente, config] = await Promise.all([
    prisma.cliente.findUnique({ where: { id: nota.clienteId }, select: { nome: true, cidade: true, uf: true } }),
    getEscritorioSpedy(),
  ])

  const dataAutorizacao = nota.autorizadaEm ?? new Date()
  const mesAno = format(dataAutorizacao, 'MMMM/yyyy', { locale: ptBR })
  const numeroFormatado = nota.numero ? `nº ${nota.numero}` : '(aguardando numeração)'
  const tomadorParte   = nota.tomadorNome ? ` para ${nota.tomadorNome}` : ''

  // 1. Registra interação no histórico do cliente
  await registrarInteracao({
    clienteId: nota.clienteId,
    tipo:      'nota_fiscal_emitida',
    origem:    'sistema',
    titulo:    `NFS-e ${numeroFormatado} autorizada${tomadorParte}`,
    conteudo:  `NFS-e ${numeroFormatado}${tomadorParte} autorizada. Serviço: ${nota.descricao}. Valor: R$ ${Number(nota.valorTotal).toFixed(2)}. Competência: ${mesAno}. Protocolo: ${nota.protocolo ?? 'N/A'}.`,
    metadados: { notaFiscalId: nota.id, numero: nota.numero, protocolo: nota.protocolo },
    escritorioEvento: true,
  }).catch(err => logger.warn('nfse-registrar-interacao-falhou', { notaId: nota.id, err }))

  // 2. Indexa no RAG
  await indexarNotaFiscalRag(nota, cliente?.nome).catch(err =>
    logger.warn('nfse-rag-falhou', { notaId: nota.id, err })
  )

  // 3. Notifica equipe no CRM
  await notificarEquipeNfsAutorizada(nota, cliente?.nome, mesAno).catch(err =>
    logger.warn('nfse-notificar-equipe-falhou', { notaId: nota.id, err })
  )

  // 4. Envia ao cliente se configurado
  if (config.spedyEnviarAoAutorizar) {
    const canal = (config.spedyEnviarCanalPadrao ?? 'whatsapp') as 'whatsapp' | 'email' | 'portal'
    await entregarNotaCliente(nota.id, canal).catch(err =>
      logger.warn('nfse-entrega-cliente-falhou', { notaId: nota.id, canal, err })
    )
  }
}

// ─── Pós-rejeição ─────────────────────────────────────────────────────────────

export async function onNotaRejeitada(nota: {
  id: string
  clienteId: string
  erroCodigo?: string | null
  erroMensagem?: string | null
  valorTotal: unknown
}): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where:  { id: nota.clienteId },
    select: { nome: true },
  })

  await notificarEquipeNfsRejeitada(nota, cliente?.nome).catch(err =>
    logger.warn('nfse-notificar-rejeicao-falhou', { notaId: nota.id, err })
  )
}

// ─── Entrega ao cliente ───────────────────────────────────────────────────────

export async function entregarNotaCliente(
  notaFiscalId: string,
  canal: 'whatsapp' | 'email' | 'portal',
): Promise<void> {
  const nota = await prisma.notaFiscal.findUnique({
    where:   { id: notaFiscalId },
    include: { cliente: true, empresa: true },
  })

  if (!nota) throw new Error(`NotaFiscal ${notaFiscalId} não encontrada`)
  if (nota.status !== 'autorizada') throw new Error(`NFS-e não está autorizada (status: ${nota.status})`)
  if (!nota.spedyId) throw new Error('NFS-e sem spedyId — não é possível gerar PDF URL')

  const config = await getEscritorioSpedy()
  const dataAuth = nota.autorizadaEm ?? nota.criadoEm
  const mesAno   = format(dataAuth, 'MMMM/yyyy', { locale: ptBR })
  const numero   = nota.numero ? `nº ${nota.numero}` : ''

  if (canal === 'whatsapp') {
    const whatsapp = nota.cliente.whatsapp ?? nota.cliente.telefone
    if (!whatsapp) {
      logger.warn('nfse-entrega-whatsapp-sem-numero', { notaId: nota.id })
      return
    }

    const apiKey = config.evolutionApiKey
      ? (isEncrypted(config.evolutionApiKey) ? decrypt(config.evolutionApiKey) : config.evolutionApiKey)
      : null

    if (!config.evolutionApiUrl || !apiKey || !config.evolutionInstance) {
      logger.warn('nfse-evolution-nao-configurado', { notaId: nota.id })
      return
    }

    const evoCfg: EvolutionConfig = {
      baseUrl:  config.evolutionApiUrl,
      apiKey,
      instance: config.evolutionInstance,
    }

    const remoteJid = whatsapp.replace(/\D/g, '') + '@s.whatsapp.net'
    const tomadorInfo = nota.tomadorNome ? ` emitida para *${nota.tomadorNome}*` : ''
    const descricaoInfo = nota.descricao ? `\n📋 Serviço: ${nota.descricao}` : ''
    const texto = `✅ *NFS-e autorizada!*\n\nOlá, ${nota.cliente.nome.split(' ')[0]}! Sua Nota Fiscal de Serviço ${numero}${tomadorInfo} foi autorizada pela prefeitura.${descricaoInfo}\n\n💰 Valor: R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}\n\nO PDF está disponível no portal do cliente.`

    await sendText(evoCfg, remoteJid, texto)

  } else if (canal === 'email') {
    // Importa dinamicamente para não criar dependência circular em casos simples
    const { sendEmail } = await import('@/lib/email/send')
    if (nota.cliente.email) {
      const tomadorParteEmail = nota.tomadorNome ? ` emitida para <b>${nota.tomadorNome}</b>` : ''
      const descricaoParteEmail = nota.descricao ? `<p><b>Serviço:</b> ${nota.descricao}</p>` : ''
      await sendEmail({
        para:    nota.cliente.email,
        assunto: `NFS-e ${numero} autorizada — ${mesAno}`,
        corpo:   `<p>Olá, ${nota.cliente.nome.split(' ')[0]}!</p><p>Sua Nota Fiscal de Serviço ${numero}${tomadorParteEmail} foi <b>autorizada</b> pela prefeitura.</p>${descricaoParteEmail}<p><b>Valor:</b> R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}</p><p>Acesse o portal para baixar o PDF.</p>`,
      })
    }
  }
  // canal portal: não é necessário fazer nada — o cliente vê automaticamente no portal

  // Atualiza registro de entrega
  await prisma.notaFiscal.update({
    where: { id: nota.id },
    data:  {
      enviadaClienteEm:    new Date(),
      enviadaClienteCanal: canal,
      atualizadoEm:        new Date(),
    },
  })
}

// ─── Cancelamento ─────────────────────────────────────────────────────────────

export async function cancelarNotaFiscal(
  notaFiscalId: string,
  justificativa: string,
): Promise<{ sucesso: boolean; detalhe?: string }> {
  const nota = await prisma.notaFiscal.findUnique({
    where:   { id: notaFiscalId },
    include: { empresa: true },
  })

  if (!nota) return { sucesso: false, detalhe: 'Nota fiscal não encontrada.' }
  if (nota.status !== 'autorizada') return { sucesso: false, detalhe: `Apenas notas autorizadas podem ser canceladas. Status atual: ${nota.status}` }
  if (!nota.spedyId) return { sucesso: false, detalhe: 'Nota sem ID Spedy — não pode ser cancelada pela API.' }

  const empresa = nota.empresa
  if (!empresa?.spedyApiKey) return { sucesso: false, detalhe: 'Empresa não configurada na Spedy.' }

  const config = await getEscritorioSpedy()

  try {
    const spedyClient = getSpedyClienteClient({
      spedyApiKey:    empresa.spedyApiKey,
      spedyAmbiente:  config.spedyAmbiente,
    })

    await spedyClient.cancelarNfse(nota.spedyId, justificativa)

    await prisma.notaFiscal.update({
      where: { id: nota.id },
      data:  {
        status:                      'cancelada',
        canceladaEm:                 new Date(),
        cancelamentoJustificativa:   justificativa,
        atualizadoEm:                new Date(),
      },
    })

    await registrarInteracao({
      clienteId: nota.clienteId,
      tipo:      'nota_fiscal_cancelada',
      origem:    'sistema',
      titulo:    `NFS-e nº ${nota.numero ?? nota.id.slice(0, 8)} cancelada`,
      conteudo:  `Nota Fiscal cancelada. Justificativa: ${justificativa}`,
      metadados: { notaFiscalId: nota.id },
    }).catch(() => null)

    return { sucesso: true }

  } catch (err) {
    logger.error('spedy-cancelamento-falhou', { notaId: nota.id, err })
    const msg = err instanceof SpedyError ? err.message : 'Erro ao cancelar na Spedy'
    return { sucesso: false, detalhe: msg }
  }
}

// ─── Reemissão (corrigir rejeitada) ──────────────────────────────────────────

export async function reemitirNotaFiscal(
  notaFiscalId: string,
  overrides?: Partial<EmitirNotaInput>,
): Promise<EmitirNotaOutput> {
  const nota = await prisma.notaFiscal.findUnique({
    where:   { id: notaFiscalId },
    include: { empresa: true },
  })

  if (!nota) return { sucesso: false, motivo: 'dados_incompletos', detalhe: 'Nota não encontrada.' }
  if (nota.status !== 'rejeitada' && nota.status !== 'erro_interno') {
    return { sucesso: false, motivo: 'dados_incompletos', detalhe: `Só é possível reemitir notas rejeitadas. Status atual: ${nota.status}` }
  }

  // Reutiliza o mesmo integrationId — a Spedy vai atualizar a nota existente
  return emitirNotaFiscal({
    clienteId:          nota.clienteId,
    ordemServicoId:     nota.ordemServicoId ?? undefined,
    descricao:          overrides?.descricao          ?? nota.descricao,
    valor:              overrides?.valor              ?? Number(nota.valorTotal),
    tomadorNome:        overrides?.tomadorNome        ?? nota.tomadorNome ?? '',
    tomadorCpfCnpj:     overrides?.tomadorCpfCnpj    ?? nota.tomadorCpfCnpj ?? '',
    tomadorEmail:       overrides?.tomadorEmail       ?? nota.tomadorEmail ?? undefined,
    tomadorMunicipio:   overrides?.tomadorMunicipio   ?? nota.tomadorMunicipio ?? undefined,
    tomadorEstado:      overrides?.tomadorEstado      ?? nota.tomadorEstado ?? undefined,
    issAliquota:        overrides?.issAliquota        ?? (nota.issAliquota ? Number(nota.issAliquota) : undefined),
    issRetido:          overrides?.issRetido          ?? nota.issRetido,
    federalServiceCode: overrides?.federalServiceCode ?? nota.federalServiceCode ?? undefined,
    cityServiceCode:    overrides?.cityServiceCode    ?? nota.cityServiceCode ?? undefined,
    taxationType:       overrides?.taxationType       ?? nota.taxationType ?? undefined,
    emitidaPorId:       overrides?.emitidaPorId,
  })
}

// ─── RAG ─────────────────────────────────────────────────────────────────────

async function indexarNotaFiscalRag(
  nota: {
    id: string
    clienteId: string
    numero?: number | null
    valorTotal: unknown
    descricao: string
    autorizadaEm?: Date | null
    protocolo?: string | null
    ordemServicoId?: string | null
    issValor?: unknown
    issRetido?: boolean
  },
  clienteNome?: string | null,
): Promise<void> {
  try {
    const { indexar: indexarRag } = await import('@/lib/rag/ingest-nota-fiscal')
    await indexarRag(nota, clienteNome)
  } catch (err) {
    logger.warn('nfse-rag-import-falhou', { notaId: nota.id, err })
  }
}

// ─── Notificações internas ────────────────────────────────────────────────────

async function notificarEquipeNfsAutorizada(
  nota: { id: string; clienteId: string; numero?: number | null; valorTotal: unknown; tomadorNome?: string | null },
  clienteNome?: string | null,
  mesAno?: string,
): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    where:  { ativo: true, tipo: { in: ['admin', 'contador'] } },
    select: { id: true },
  })
  if (!usuarios.length) return

  const numero   = nota.numero ? `nº ${nota.numero}` : ''
  const valor    = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`
  const tomador  = nota.tomadorNome ? ` → ${nota.tomadorNome}` : ''

  await prisma.notificacao.createMany({
    data: usuarios.map(u => ({
      usuarioId: u.id,
      tipo:      'nfse_autorizada',
      titulo:    `NFS-e ${numero} autorizada`,
      mensagem:  `${clienteNome ?? 'Cliente'}${tomador} • ${valor}${mesAno ? ` • ${mesAno}` : ''}`,
      url:       `/crm/clientes/${nota.clienteId}?aba=notas-fiscais`,
    })),
  })
}

async function notificarEquipeNfsRejeitada(
  nota: { id: string; clienteId: string; erroCodigo?: string | null; erroMensagem?: string | null; valorTotal: unknown },
  clienteNome?: string | null,
): Promise<void> {
  const usuarios = await prisma.usuario.findMany({
    where:  { ativo: true, tipo: { in: ['admin', 'contador'] } },
    select: { id: true },
  })
  if (!usuarios.length) return

  const codigo = nota.erroCodigo ? ` — Código ${nota.erroCodigo}` : ''
  const motivo = nota.erroMensagem ?? 'Motivo não informado'

  await prisma.notificacao.createMany({
    data: usuarios.map(u => ({
      usuarioId: u.id,
      tipo:      'nfse_rejeitada',
      titulo:    `NFS-e rejeitada${codigo}`,
      mensagem:  `${clienteNome ?? 'Cliente'} • ${motivo.slice(0, 100)}`,
      url:       `/crm/clientes/${nota.clienteId}?aba=notas-fiscais`,
    })),
  })
}
