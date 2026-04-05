import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const STATUS_PT: Record<string, string> = {
  PENDING:   'Em aberto',
  RECEIVED:  'Pago',
  OVERDUE:   'Vencido',
  REFUNDED:  'Reembolsado',
  CANCELLED: 'Cancelado',
}

const FORMA_PT: Record<string, string> = {
  pix:    'PIX',
  boleto: 'Boleto',
}

const extratoFinanceiroTool: Tool = {
  definition: {
    name: 'extratoFinanceiro',
    description:
      'Retorna o extrato completo de pagamentos do cliente — histórico de cobranças pagas, em aberto e vencidas. ' +
      'Use quando: cliente perguntar "quanto já paguei?", "me mostra meu histórico de pagamentos", "extrato financeiro", "o que paguei nos últimos meses?". ' +
      'Diferente de listarCobrancasCliente (últimas N cobranças), este retorna um resumo financeiro consolidado com totais. ' +
      'No portal/WhatsApp usa o clienteId do contexto automaticamente.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. No portal/WhatsApp é preenchido pelo contexto automaticamente.',
        },
        ano: {
          type: 'number',
          description: 'Filtrar cobranças do ano específico (ex: 2025). Opcional — sem filtro retorna todas.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Extrato financeiro do cliente',
    descricao: 'Consolida o histórico de pagamentos com totais por status. Útil para o cliente entender sua situação financeira geral.',
    categoria: 'Financeiro',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      clienteId: z.string().optional(),
      ano:       z.number().int().min(2000).max(2100).optional(),
    }).safeParse(input)

    if (!parsed.success) {
      return { sucesso: false, erro: parsed.error.issues[0].message, resumo: 'Parâmetros inválidos.' }
    }

    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    if (!clienteId) {
      return {
        sucesso: false,
        erro:    'clienteId não disponível no contexto.',
        resumo:  'Não foi possível identificar o cliente para gerar o extrato.',
      }
    }

    // No portal/whatsapp, bloqueia acesso a extrato de outro cliente
    const isCanalRestrito = ctx.solicitanteAI === 'portal' || ctx.solicitanteAI === 'whatsapp'
    if (isCanalRestrito && parsed.data.clienteId && parsed.data.clienteId !== ctx.clienteId) {
      return {
        sucesso: false,
        erro:    'Acesso negado: não é possível consultar o extrato de outro cliente.',
        resumo:  'Acesso negado.',
      }
    }

    try {
      const whereDate = parsed.data.ano
        ? {
            vencimento: {
              gte: new Date(`${parsed.data.ano}-01-01`),
              lt:  new Date(`${parsed.data.ano + 1}-01-01`),
            },
          }
        : {}

      const cobrancas = await prisma.cobrancaAsaas.findMany({
        where:   { clienteId, status: { notIn: ['CANCELLED'] }, ...whereDate },
        orderBy: [{ vencimento: 'desc' }],
        select: {
          valor:          true,
          vencimento:     true,
          status:         true,
          formaPagamento: true,
          pagoEm:         true,
          valorPago:      true,
        },
      })

      if (cobrancas.length === 0) {
        return {
          sucesso: true,
          dados:   { totalPago: 0, totalAberto: 0, totalVencido: 0, cobrancas: [] },
          resumo:  'Nenhuma cobrança encontrada para este cliente.',
        }
      }

      const totalPago    = cobrancas.filter(c => c.status === 'RECEIVED').reduce((s, c) => s + Number(c.valorPago ?? c.valor), 0)
      const totalAberto  = cobrancas.filter(c => c.status === 'PENDING').reduce((s, c) => s + Number(c.valor), 0)
      const totalVencido = cobrancas.filter(c => c.status === 'OVERDUE').reduce((s, c) => s + Number(c.valor), 0)

      const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

      const linhas = cobrancas.map(c => {
        const venc   = new Date(c.vencimento).toLocaleDateString('pt-BR')
        const status = STATUS_PT[c.status] ?? c.status
        const valor  = fmt(Number(c.valor))
        const forma  = FORMA_PT[c.formaPagamento] ?? c.formaPagamento
        const pago   = c.pagoEm ? ` (pago em ${new Date(c.pagoEm).toLocaleDateString('pt-BR')})` : ''
        return `• ${venc} — ${valor} — ${status} — ${forma}${pago}`
      })

      const periodo = parsed.data.ano ? ` de ${parsed.data.ano}` : ''
      const resumo = [
        `📊 Extrato financeiro${periodo}:`,
        `✅ Total pago: ${fmt(totalPago)}`,
        totalAberto  > 0 ? `🕐 Em aberto: ${fmt(totalAberto)}`  : null,
        totalVencido > 0 ? `⚠️ Vencido: ${fmt(totalVencido)}`   : null,
        '',
        `Histórico (${cobrancas.length} cobranças):`,
        ...linhas,
      ].filter(l => l !== null).join('\n')

      return {
        sucesso: true,
        dados: {
          totalPago,
          totalAberto,
          totalVencido,
          cobrancas: cobrancas.map(c => ({
            ...c,
            valor:    Number(c.valor),
            valorPago: c.valorPago != null ? Number(c.valorPago) : null,
          })),
        },
        resumo,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[tool/extratoFinanceiro] erro:', err)
      Sentry.captureException(err, {
        tags:  { module: 'tool', operation: 'extratoFinanceiro' },
        extra: { clienteId, canal: ctx.solicitanteAI },
      })
      return { sucesso: false, erro: msg, resumo: 'Erro ao gerar extrato financeiro.' }
    }
  },
}

registrarTool(extratoFinanceiroTool)
