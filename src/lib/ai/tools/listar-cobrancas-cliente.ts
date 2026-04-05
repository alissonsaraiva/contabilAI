import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
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

const listarCobrancasClienteTool: Tool = {
  definition: {
    name: 'listarCobrancasCliente',
    description:
      'Lista as cobranças (mensalidades) de um cliente — status, vencimento, valor e se está em dia. ' +
      'Use quando: cliente perguntar "meu boleto venceu?", "estou inadimplente?", "estou em dia?", "qual o meu próximo vencimento?", "quanto vale minha fatura?", ou quando o operador quiser ver a situação financeira de um cliente. ' +
      'No WhatsApp/portal usa o clienteId do contexto automaticamente.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. No WhatsApp/portal é preenchido pelo contexto automaticamente.',
        },
        limite: {
          type: 'number',
          description: 'Quantidade máxima de cobranças a retornar (padrão: 6, máx: 24).',
        },
        apenasAberto: {
          type: 'boolean',
          description: 'Se true, retorna apenas cobranças PENDING ou OVERDUE. Padrão: false.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Listar cobranças do cliente',
    descricao: 'Mostra o histórico de cobranças com status de pagamento. Útil para verificar inadimplência e vencimentos.',
    categoria: 'Financeiro',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      clienteId:    z.string().optional(),
      limite:       z.number().int().min(1).max(24).optional(),
      apenasAberto: z.boolean().optional(),
    }).safeParse(input)

    if (!parsed.success) {
      return { sucesso: false, erro: parsed.error.issues[0].message, resumo: 'Parâmetros inválidos.' }
    }

    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    if (!clienteId) {
      return {
        sucesso: false,
        erro:    'clienteId não disponível no contexto.',
        resumo:  'Não foi possível identificar o cliente para listar cobranças.',
      }
    }

    // No portal/whatsapp, bloqueia busca por clienteId diferente do contexto
    const isCanalRestrito = ctx.solicitanteAI === 'portal' || ctx.solicitanteAI === 'whatsapp'
    if (isCanalRestrito && parsed.data.clienteId && parsed.data.clienteId !== ctx.clienteId) {
      return {
        sucesso: false,
        erro:    'Acesso negado: não é possível consultar cobranças de outro cliente.',
        resumo:  'Acesso negado.',
      }
    }

    try {
      const limite = parsed.data.limite ?? 6

      const where: Prisma.CobrancaAsaasWhereInput = parsed.data.apenasAberto
        ? { clienteId, status: { in: ['PENDING', 'OVERDUE'] as const } }
        : { clienteId }

      const cobrancas = await prisma.cobrancaAsaas.findMany({
        where,
        orderBy: [{ vencimento: 'desc' }, { criadoEm: 'desc' }],
        take:    limite,
        select: {
          id:             true,
          valor:          true,
          vencimento:     true,
          status:         true,
          formaPagamento: true,
          pagoEm:         true,
          valorPago:      true,
          invoiceUrl:     true,
        },
      })

      if (cobrancas.length === 0) {
        return {
          sucesso: true,
          dados:   [],
          resumo:  'Nenhuma cobrança encontrada para este cliente.',
        }
      }

      // Detecta situação geral do cliente
      const temVencida  = cobrancas.some(c => c.status === 'OVERDUE')
      const temAberta   = cobrancas.some(c => c.status === 'PENDING')
      const todasPagas  = cobrancas.every(c => c.status === 'RECEIVED' || c.status === 'CANCELLED')

      const situacao = temVencida
        ? '⚠️ Há cobrança(s) VENCIDA(S) — cliente em inadimplência.'
        : todasPagas
          ? '✅ Cliente em dia com todos os pagamentos.'
          : temAberta
            ? '🕐 Há cobrança(s) em aberto ainda não vencida(s).'
            : 'Situação financeira não determinada.'

      const linhas = cobrancas.map(c => {
        const venc   = new Date(c.vencimento).toLocaleDateString('pt-BR')
        const status = STATUS_PT[c.status] ?? c.status
        const valor  = `R$ ${Number(c.valor).toFixed(2).replace('.', ',')}`
        const pago   = c.pagoEm ? ` (pago em ${new Date(c.pagoEm).toLocaleDateString('pt-BR')})` : ''
        return `• ${venc} — ${valor} — ${status}${pago}`
      })

      return {
        sucesso: true,
        dados:   cobrancas.map(c => ({
          ...c,
          valor:    Number(c.valor),
          valorPago: c.valorPago != null ? Number(c.valorPago) : null,
        })),
        resumo:  [situacao, `Últimas ${cobrancas.length} cobranças:`, ...linhas].join('\n'),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[tool/listarCobrancasCliente] erro:', err)
      Sentry.captureException(err, {
        tags:  { module: 'tool', operation: 'listarCobrancasCliente' },
        extra: { clienteId, canal: ctx.solicitanteAI },
      })
      return { sucesso: false, erro: msg, resumo: 'Erro ao buscar cobranças do cliente.' }
    }
  },
}

registrarTool(listarCobrancasClienteTool)
