/**
 * Serviço de automação DAS MEI.
 *
 * Centraliza toda lógica de:
 *   - Geração de DAS via SERPRO Integra-MEI
 *   - Verificação de pagamento via Integra-Pagamento
 *   - Notificações multicanal (email / WhatsApp / PWA)
 *
 * Usado pelos crons e pelas rotas manuais do CRM.
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { sendText } from '@/lib/evolution'
import { sendPushToCliente } from '@/lib/push'
import { buildRemoteJid } from '@/lib/whatsapp-utils'
import { decrypt, isEncrypted } from '@/lib/crypto'
import type { EvolutionConfig } from '@/lib/evolution'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DasMEICanais {
  email:    boolean
  whatsapp: boolean
  pwa:      boolean
}

interface EscritorioConfig {
  canais:             DasMEICanais
  evolutionApiUrl?:   string
  evolutionApiKey?:   string
  evolutionInstance?: string
  emailRemetente?:    string
  emailNome?:         string
}

// ─── Config loader ────────────────────────────────────────────────────────────

async function getEscritorioConfig(): Promise<EscritorioConfig> {
  const row = await prisma.escritorio.findFirst({
    select: {
      dasMeiCanalEmail:    true,
      dasMeiCanalWhatsapp: true,
      dasMeiCanalPwa:      true,
      evolutionApiUrl:     true,
      evolutionApiKey:     true,
      evolutionInstance:   true,
      emailRemetente:      true,
      emailNome:           true,
    },
  })

  return {
    canais: {
      email:    row?.dasMeiCanalEmail    ?? true,
      whatsapp: row?.dasMeiCanalWhatsapp ?? true,
      pwa:      row?.dasMeiCanalPwa      ?? true,
    },
    evolutionApiUrl:   row?.evolutionApiUrl   ?? undefined,
    evolutionApiKey:   row?.evolutionApiKey   ?? undefined,
    evolutionInstance: row?.evolutionInstance ?? undefined,
    emailRemetente:    row?.emailRemetente     ?? undefined,
    emailNome:         row?.emailNome          ?? undefined,
  }
}

function buildEvolutionCfg(cfg: EscritorioConfig): EvolutionConfig | null {
  if (!cfg.evolutionApiUrl || !cfg.evolutionApiKey || !cfg.evolutionInstance) return null
  return {
    baseUrl:  cfg.evolutionApiUrl,
    apiKey:   isEncrypted(cfg.evolutionApiKey) ? decrypt(cfg.evolutionApiKey) : cfg.evolutionApiKey,
    instance: cfg.evolutionInstance,
  }
}

// ─── Formatação ───────────────────────────────────────────────────────────────

function formatarCompetencia(competencia: string): string {
  // "202601" → "01/2026"
  const ano = competencia.slice(0, 4)
  const mes = competencia.slice(4, 6)
  return `${mes}/${ano}`
}

function formatarValor(valor?: number | null): string {
  if (valor == null) return '—'
  return `R$ ${Number(valor).toFixed(2).replace('.', ',')}`
}

function formatarData(data?: Date | string | null): string {
  if (!data) return '—'
  const d = data instanceof Date ? data : new Date(data)
  return d.toLocaleDateString('pt-BR')
}

// ─── Gerar e salvar DAS ───────────────────────────────────────────────────────

/**
 * Gera a DAS de um cliente MEI para a competência informada, salva no banco
 * e envia notificação pelos canais configurados.
 *
 * @param clienteId   ID do cliente no banco
 * @param competencia Formato AAAAMM (ex: "202601"). Se omitido, usa mês corrente.
 * @returns O registro DasMEI criado ou atualizado.
 */
export async function gerarESalvarDASMEI(clienteId: string, competencia?: string) {
  // Resolve competência padrão = mês corrente
  const agora = new Date()
  const comp  = competencia ?? `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: {
      id: true, nome: true, email: true, whatsapp: true,
      empresa: { select: { id: true, cnpj: true, regime: true, procuracaoRFAtiva: true } },
    },
  })

  if (!cliente) throw new Error(`Cliente ${clienteId} não encontrado.`)
  if (!cliente.empresa?.cnpj) throw new Error(`Cliente ${clienteId} não possui CNPJ cadastrado.`)
  if (cliente.empresa.regime !== 'MEI') throw new Error(`Cliente ${clienteId} não é MEI.`)
  if (!cliente.empresa.procuracaoRFAtiva) throw new Error(`Cliente ${clienteId} não possui procuração RF ativa — DAS não pode ser gerada pelo SERPRO.`)

  const cnpj = cliente.empresa.cnpj.replace(/[.\-/\s]/g, '')

  let status: 'pendente' | 'erro' = 'pendente'
  let erroMsg: string | undefined
  let codigoBarras: string | undefined
  let valor: number | undefined
  let dataVencimento: Date | undefined
  let urlDas: string | undefined
  let rawData: unknown

  try {
    const { gerarDASMEI } = await import('@/lib/services/integra-contador')
    const das = await gerarDASMEI(cnpj, comp)

    codigoBarras  = das.codigoBarras
    valor         = das.valor ?? undefined
    urlDas        = das.urlDas
    rawData       = das.raw

    if (das.dataVencimento) {
      const dv = new Date(das.dataVencimento)
      if (!isNaN(dv.getTime())) dataVencimento = dv
    }
  } catch (err) {
    erroMsg = err instanceof Error ? err.message : String(err)
    status  = 'erro'
    Sentry.captureException(err, {
      tags:  { module: 'das-mei', operation: 'gerar-das' },
      extra: { clienteId, cnpj, comp },
    })
  }

  // Upsert — idempotente por (empresaId, competencia)
  const das = await prisma.dasMEI.upsert({
    where:  { empresaId_competencia: { empresaId: cliente.empresa.id, competencia: comp } },
    update: {
      status,
      codigoBarras:  codigoBarras  ?? undefined,
      valor:         valor         != null ? valor : undefined,
      dataVencimento: dataVencimento ?? undefined,
      urlDas:        urlDas        ?? undefined,
      erroMsg:       erroMsg       ?? null,
      raw:           rawData       as any ?? undefined,
      atualizadoEm:  new Date(),
    },
    create: {
      empresaId:    cliente.empresa.id,
      clienteId:    cliente.id,
      competencia:  comp,
      status,
      codigoBarras,
      valor,
      dataVencimento,
      urlDas,
      erroMsg,
      raw:          rawData as any ?? undefined,
    },
  })

  // Só notifica se gerou com sucesso e ainda não notificou
  if (status === 'pendente' && !das.notificadoEm) {
    try {
      const cfg = await getEscritorioConfig()
      await notificarDASDisponivel(das, cliente, cfg)

      await prisma.dasMEI.update({
        where: { id: das.id },
        data:  { notificadoEm: new Date() },
      })
    } catch (err) {
      Sentry.captureException(err, {
        tags:  { module: 'das-mei', operation: 'notificar-disponivel' },
        extra: { dasId: das.id, clienteId },
      })
    }
  }

  return das
}

// ─── Verificar pagamento ──────────────────────────────────────────────────────

/**
 * Sincroniza o status de pagamento de uma DAS MEI com o SERPRO.
 * Atualiza `status` para "paga" se confirmado.
 */
export async function sincronizarPagamentoDAS(dasId: string) {
  const das = await prisma.dasMEI.findUnique({
    where:   { id: dasId },
    include: {
      empresa: { select: { cnpj: true } },
      cliente: { select: { id: true, nome: true, email: true, whatsapp: true } },
    },
  })

  if (!das)              throw new Error(`DasMEI ${dasId} não encontrada.`)
  if (das.status === 'paga') return das  // já paga, nada a fazer

  const cnpj = das.empresa.cnpj?.replace(/[.\-/\s]/g, '')
  if (!cnpj) throw new Error('Empresa sem CNPJ.')

  try {
    const { verificarPagamentoDASMEI } = await import('@/lib/services/integra-contador')
    const resultado = await verificarPagamentoDASMEI(cnpj, das.competencia)

    if (resultado.pago) {
      await prisma.dasMEI.update({
        where: { id: dasId },
        data: {
          status:      'paga',
          erroMsg:     null,
          atualizadoEm: new Date(),
        },
      })
      return { ...das, status: 'paga' as const }
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'das-mei', operation: 'sincronizar-pagamento' },
      extra: { dasId, cnpj, competencia: das.competencia },
    })
    throw err
  }

  return das
}

// ─── Notificações ─────────────────────────────────────────────────────────────

interface ClienteNotif {
  id:        string
  nome:      string
  email:     string
  whatsapp?: string | null
}

type DasMEIRecord = Awaited<ReturnType<typeof prisma.dasMEI.findUnique>> & {}

export async function notificarDASDisponivel(
  das:     DasMEIRecord,
  cliente: ClienteNotif,
  cfg:     EscritorioConfig,
) {
  const comp    = formatarCompetencia(das!.competencia)
  const valor   = formatarValor(das!.valor != null ? Number(das!.valor) : undefined)
  const venc    = formatarData(das!.dataVencimento)

  const results = await Promise.allSettled([
    // E-mail
    cfg.canais.email && cliente.email
      ? sendEmail({
          para:    cliente.email,
          assunto: `DAS MEI disponível — ${comp}`,
          corpo:   `
            <p>Olá, <strong>${cliente.nome}</strong>!</p>
            <p>A DAS MEI referente a <strong>${comp}</strong> está disponível.</p>
            <ul>
              <li><strong>Valor:</strong> ${valor}</li>
              <li><strong>Vencimento:</strong> ${venc}</li>
              ${das!.codigoBarras ? `<li><strong>Código de barras:</strong> <code>${das!.codigoBarras}</code></li>` : ''}
              ${das!.urlDas ? `<li><a href="${das!.urlDas}">Clique aqui para baixar a DAS</a></li>` : ''}
            </ul>
            <p>Acesse o portal do cliente para mais detalhes.</p>
          `,
        })
      : Promise.resolve(),

    // WhatsApp
    cfg.canais.whatsapp && cliente.whatsapp
      ? (async () => {
          const evoCfg = buildEvolutionCfg(cfg)
          if (!evoCfg) return
          const jid = buildRemoteJid(cliente.whatsapp!)
          if (!jid) return
          const msg = [
            `*DAS MEI disponível — ${comp}*`,
            `Valor: ${valor}`,
            `Vencimento: ${venc}`,
            das!.codigoBarras ? `Código de barras:\n${das!.codigoBarras}` : '',
            das!.urlDas ? `Link para pagamento: ${das!.urlDas}` : '',
          ].filter(Boolean).join('\n')
          await sendText(evoCfg, jid, msg)
        })()
      : Promise.resolve(),

    // PWA
    cfg.canais.pwa
      ? sendPushToCliente(cliente.id, {
          title: `DAS MEI — ${comp}`,
          body:  `Disponível. Vencimento: ${venc}. Valor: ${valor}.`,
          url:   '/portal/financeiro',
        })
      : Promise.resolve(),
  ])

  const canais = ['email', 'whatsapp', 'pwa']
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      Sentry.captureException(r.reason, {
        tags:  { module: 'das-mei', operation: `notificar-disponivel-${canais[i]}` },
        extra: { dasId: das!.id, clienteId: cliente.id },
      })
    }
  })
}

export async function notificarDASVencimento(
  das:     DasMEIRecord,
  cliente: ClienteNotif,
  cfg:     EscritorioConfig,
) {
  const comp  = formatarCompetencia(das!.competencia)
  const valor = formatarValor(das!.valor != null ? Number(das!.valor) : undefined)
  const venc  = formatarData(das!.dataVencimento)

  const results = await Promise.allSettled([
    cfg.canais.email && cliente.email
      ? sendEmail({
          para:    cliente.email,
          assunto: `Lembrete: DAS MEI vence hoje — ${comp}`,
          corpo:   `
            <p>Olá, <strong>${cliente.nome}</strong>!</p>
            <p>A DAS MEI de <strong>${comp}</strong> vence <strong>hoje (${venc})</strong>.</p>
            <ul>
              <li><strong>Valor:</strong> ${valor}</li>
              ${das!.codigoBarras ? `<li><strong>Código de barras:</strong> <code>${das!.codigoBarras}</code></li>` : ''}
              ${das!.urlDas ? `<li><a href="${das!.urlDas}">Baixar DAS</a></li>` : ''}
            </ul>
            <p>Pague hoje para evitar multa e juros.</p>
          `,
        })
      : Promise.resolve(),

    cfg.canais.whatsapp && cliente.whatsapp
      ? (async () => {
          const evoCfg = buildEvolutionCfg(cfg)
          if (!evoCfg) return
          const jid = buildRemoteJid(cliente.whatsapp!)
          if (!jid) return
          const msg = [
            `⚠️ *Lembrete: DAS MEI vence hoje — ${comp}*`,
            `Valor: ${valor}`,
            `Vencimento: ${venc}`,
            das!.codigoBarras ? `Código:\n${das!.codigoBarras}` : '',
            das!.urlDas ? `Link para pagamento: ${das!.urlDas}` : '',
          ].filter(Boolean).join('\n')
          await sendText(evoCfg, jid, msg)
        })()
      : Promise.resolve(),

    cfg.canais.pwa
      ? sendPushToCliente(cliente.id, {
          title: `DAS MEI vence hoje — ${comp}`,
          body:  `Valor: ${valor}. Pague hoje para evitar juros.`,
          url:   '/portal/financeiro',
        })
      : Promise.resolve(),
  ])

  const canais = ['email', 'whatsapp', 'pwa']
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      Sentry.captureException(r.reason, {
        tags:  { module: 'das-mei', operation: `notificar-vencimento-${canais[i]}` },
        extra: { dasId: das!.id, clienteId: cliente.id },
      })
    }
  })
}

export async function notificarDASAtrasada(
  das:      DasMEIRecord,
  cliente:  ClienteNotif,
  cfg:      EscritorioConfig,
  diasAtraso: number,
) {
  const comp  = formatarCompetencia(das!.competencia)
  const valor = formatarValor(das!.valor != null ? Number(das!.valor) : undefined)

  const results = await Promise.allSettled([
    cfg.canais.email && cliente.email
      ? sendEmail({
          para:    cliente.email,
          assunto: `DAS MEI em atraso — ${diasAtraso} dia(s) — ${comp}`,
          corpo:   `
            <p>Olá, <strong>${cliente.nome}</strong>!</p>
            <p>A DAS MEI de <strong>${comp}</strong> está em atraso há <strong>${diasAtraso} dia(s)</strong>.</p>
            <ul>
              <li><strong>Valor original:</strong> ${valor}</li>
              ${das!.codigoBarras ? `<li><strong>Código de barras:</strong> <code>${das!.codigoBarras}</code></li>` : ''}
              ${das!.urlDas ? `<li><a href="${das!.urlDas}">Baixar DAS para pagamento</a></li>` : ''}
            </ul>
            <p>O pagamento em atraso gera multa de 0,33% ao dia + juros SELIC. Regularize o quanto antes.</p>
          `,
        })
      : Promise.resolve(),

    cfg.canais.whatsapp && cliente.whatsapp
      ? (async () => {
          const evoCfg = buildEvolutionCfg(cfg)
          if (!evoCfg) return
          const jid = buildRemoteJid(cliente.whatsapp!)
          if (!jid) return
          const msg = [
            `🚨 *DAS MEI em atraso — ${diasAtraso} dia(s) — ${comp}*`,
            `Valor original: ${valor}`,
            das!.codigoBarras ? `Código para pagamento:\n${das!.codigoBarras}` : '',
            das!.urlDas ? `Link da DAS: ${das!.urlDas}` : '',
            `Regularize para evitar encargos crescentes.`,
          ].filter(Boolean).join('\n')
          await sendText(evoCfg, jid, msg)
        })()
      : Promise.resolve(),

    cfg.canais.pwa
      ? sendPushToCliente(cliente.id, {
          title: `DAS MEI em atraso — ${diasAtraso} dia(s)`,
          body:  `${comp} — ${valor}. Regularize para evitar juros.`,
          url:   '/portal/financeiro',
        })
      : Promise.resolve(),
  ])

  const canais = ['email', 'whatsapp', 'pwa']
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      Sentry.captureException(r.reason, {
        tags:  { module: 'das-mei', operation: `notificar-atrasada-${canais[i]}` },
        extra: { dasId: das!.id, clienteId: cliente.id, diasAtraso },
      })
    }
  })
}

/** Exporta config loader para uso nos crons */
export { getEscritorioConfig }
