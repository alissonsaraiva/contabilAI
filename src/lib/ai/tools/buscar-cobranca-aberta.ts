import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const buscarCobrancaAbertaTool: Tool = {
  definition: {
    name: 'buscarCobrancaAberta',
    description:
      'Busca a cobrança em aberto (pendente ou vencida) do cliente atual. Retorna valor, data de vencimento, código PIX copia-e-cola e link do boleto. ' +
      'Use quando o cliente perguntar sobre boleto, pagamento, cobrança, conta em aberto, PIX ou segunda via.',
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

    const [cobranca, totalAberto, cliente] = await Promise.all([
      prisma.cobrancaAsaas.findFirst({
        where:   { clienteId, status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { vencimento: 'asc' },
        select: {
          id: true, valor: true, vencimento: true, status: true,
          formaPagamento: true, linkBoleto: true,
          pixCopiaECola: true, pixQrCode: true, atualizadoEm: true,
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
    ])

    if (!cobranca) {
      // Sem cobrança registrada — informa dia de vencimento do próximo ciclo se souber
      const diaVenc = cliente?.vencimentoDia
      const proxVencInfo = diaVenc
        ? ` Seu vencimento mensal é dia ${diaVenc}. A cobrança do próximo mês será gerada automaticamente.`
        : ''
      return {
        sucesso: true,
        dados:  { vencimentoDia: diaVenc ?? null },
        resumo: `Nenhuma cobrança em aberto encontrada. Sua situação está regularizada! ✅${proxVencInfo}`,
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

    // Verifica se PIX pode estar expirado (>20h desde última atualização)
    const pixExpirado = cobranca.pixCopiaECola && cobranca.atualizadoEm
      && (Date.now() - new Date(cobranca.atualizadoEm).getTime()) > 20 * 3600 * 1000

    const linhas = [
      qtd > 1
        ? `Há *${qtd} cobranças em aberto* totalizando *${totalStr}*. Mostrando a mais antiga:`
        : '',
      `Cobrança em aberto: *${valor}* — vencimento ${venc}`,
      cobranca.status === 'OVERDUE'
        ? `⚠️ Em atraso há ${diasAtraso} dia(s)`
        : '🟡 Aguardando pagamento',
      !pixExpirado && cobranca.pixCopiaECola
        ? `\n*PIX Copia e Cola:*\n${cobranca.pixCopiaECola}`
        : '',
      cobranca.linkBoleto
        ? `\n*Link do boleto:* ${cobranca.linkBoleto}`
        : '',
      pixExpirado
        ? '\n⚠️ O PIX armazenado pode estar expirado. Use gerarSegundaViaAsaas para gerar uma nova cobrança atualizada.'
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
