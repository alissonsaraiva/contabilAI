import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import { refresharPixCobranca } from '@/lib/services/asaas-sync'

const buscarCobrancaAbertaTool: Tool = {
  definition: {
    name: 'buscarCobrancaAberta',
    description:
      'Busca a cobrança em aberto (pendente ou vencida) do cliente atual. Retorna valor, data de vencimento, código PIX copia-e-cola e link do boleto. ' +
      'Use quando o cliente perguntar sobre boleto, pagamento, cobrança, conta em aberto ou PIX. ' +
      'NÃO use para pedidos de segunda via — esses devem ir para gerarSegundaViaAsaas.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  meta: {
    label: 'Buscar cobrança em aberto',
    descricao: 'Retorna cobrança em aberto com PIX/boleto para o cliente atual.',
    categoria: 'Financeiro',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = ctx.clienteId
    if (!clienteId) {
      return {
        sucesso: false,
        erro:   'ClienteId não disponível no contexto.',
        resumo: 'Não foi possível identificar o cliente para buscar a cobrança.',
      }
    }

    const [cobranca, totalAberto, cliente, ultimoPago] = await Promise.all([
      prisma.cobrancaAsaas.findFirst({
        where:   { clienteId, status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { vencimento: 'asc' },
        select: {
          id: true, valor: true, vencimento: true, status: true,
          formaPagamento: true, linkBoleto: true,
          pixCopiaECola: true, pixQrCode: true, atualizadoEm: true, pixGeradoEm: true,
        },
      }),
      prisma.cobrancaAsaas.aggregate({
        where: { clienteId, status: { in: ['PENDING', 'OVERDUE'] } },
        _count: { id: true },
        _sum:   { valor: true },
      }),
      prisma.cliente.findUnique({
        where:  { id: clienteId },
        select: { vencimentoDia: true, valorMensal: true },
      }),
      prisma.cobrancaAsaas.findFirst({
        where:   { clienteId, status: 'RECEIVED' },
        orderBy: { vencimento: 'desc' },
        select:  { valor: true, vencimento: true, pagoEm: true },
      }),
    ])

    if (!cobranca) {
      // Sem cobrança registrada — informa último pagamento e próximo vencimento
      const diaVenc      = cliente?.vencimentoDia
      const proxVencInfo = diaVenc
        ? ` Seu vencimento mensal é dia ${diaVenc}. A cobrança do próximo mês será gerada automaticamente.`
        : ''

      const ultimoPagoInfo = ultimoPago
        ? (() => {
            const dataPag = ultimoPago.pagoEm
              ? new Date(ultimoPago.pagoEm).toLocaleDateString('pt-BR')
              : new Date(ultimoPago.vencimento).toLocaleDateString('pt-BR')
            const valorPag = Number(ultimoPago.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            return ` Seu último pagamento foi de ${valorPag}, recebido em ${dataPag}.`
          })()
        : ''

      return {
        sucesso: true,
        dados:   { vencimentoDia: diaVenc ?? null, ultimoPago: ultimoPago ?? null },
        resumo:  `Nenhuma cobrança em aberto. Situação regularizada! ✅${ultimoPagoInfo}${proxVencInfo}`,
      }
    }

    const hoje       = new Date()
    const valor      = Number(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const venc       = cobranca.vencimento.toLocaleDateString('pt-BR')
    const diasAtraso = cobranca.vencimento < hoje
      ? Math.floor((hoje.getTime() - cobranca.vencimento.getTime()) / 86400000)
      : 0
    const qtd        = totalAberto._count.id
    const totalStr   = Number(totalAberto._sum.valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    // Verifica expiração usando pixGeradoEm (preciso) com fallback para atualizadoEm
    const pixBaseTime = cobranca.pixGeradoEm ?? cobranca.atualizadoEm
    const pixExpirado = cobranca.pixCopiaECola && pixBaseTime
      && (Date.now() - new Date(pixBaseTime).getTime()) > 20 * 3600 * 1000

    // PENDING + PIX expirado → renova QR code sem cancelar a cobrança
    let pixAtualizado = cobranca.pixCopiaECola
    if (pixExpirado && cobranca.status === 'PENDING') {
      const refreshed = await refresharPixCobranca(cobranca.id).catch(err => { console.error('[tool/buscar-cobranca] falha ao renovar PIX:', err); return null })
      if (refreshed) pixAtualizado = refreshed.pixCopiaECola
    }

    const linhas = [
      qtd > 1
        ? `Há *${qtd} cobranças em aberto* totalizando *${totalStr}*. Mostrando a mais antiga:`
        : '',
      `Cobrança em aberto: *${valor}* — vencimento ${venc}`,
      cobranca.status === 'OVERDUE'
        ? `⚠️ Em atraso há ${diasAtraso} dia(s)`
        : '🟡 Aguardando pagamento',
      pixAtualizado && (!pixExpirado || cobranca.status === 'PENDING')
        ? `\n*PIX Copia e Cola:*\n${pixAtualizado}`
        : '',
      cobranca.linkBoleto
        ? `\n*Link do boleto:* ${cobranca.linkBoleto}`
        : '',
      pixExpirado && cobranca.status === 'OVERDUE'
        ? '\n⚠️ PIX indisponível para cobrança vencida. Use gerarSegundaViaAsaas para criar nova cobrança com data atualizada.'
        : '',
    ].filter(Boolean)

    return {
      sucesso: true,
      dados:   { ...cobranca, diasAtraso, qtdCobrancasAbertas: qtd, totalEmAberto: totalAberto._sum.valor },
      resumo:  linhas.join('\n'),
    }
  },
}

registrarTool(buscarCobrancaAbertaTool)
