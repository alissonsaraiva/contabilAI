import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { alterarFormaPagamentoAsaas } from '@/lib/services/asaas-sync'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const FORMA_PT: Record<string, string> = {
  pix:    'PIX',
  boleto: 'Boleto bancário',
}

const alterarFormaPagamentoTool: Tool = {
  definition: {
    name: 'alterarFormaPagamento',
    description:
      'Altera a forma de pagamento da mensalidade do cliente entre PIX e boleto bancário. ' +
      'Use quando: cliente pedir "quero pagar por PIX", "mudar para boleto", "trocar forma de pagamento", etc. ' +
      'No portal/WhatsApp usa o clienteId do contexto automaticamente.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. No portal/WhatsApp é preenchido pelo contexto automaticamente.',
        },
        forma: {
          type: 'string',
          enum: ['pix', 'boleto'],
          description: 'Nova forma de pagamento: "pix" ou "boleto".',
        },
      },
      required: ['forma'],
    },
  },

  meta: {
    label: 'Alterar forma de pagamento',
    descricao: 'Muda a forma de pagamento da mensalidade (PIX ou boleto) na assinatura Asaas.',
    categoria: 'Financeiro',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      clienteId: z.string().optional(),
      forma:     z.enum(['pix', 'boleto']),
    }).safeParse(input)

    if (!parsed.success) {
      return { sucesso: false, erro: parsed.error.issues[0].message, resumo: 'Parâmetros inválidos.' }
    }

    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    if (!clienteId) {
      return {
        sucesso: false,
        erro:    'clienteId não disponível no contexto.',
        resumo:  'Não foi possível identificar o cliente para alterar a forma de pagamento.',
      }
    }

    // No portal/whatsapp, bloqueia alteração de outro cliente
    const isCanalRestrito = ctx.solicitanteAI === 'portal' || ctx.solicitanteAI === 'whatsapp'
    if (isCanalRestrito && parsed.data.clienteId && parsed.data.clienteId !== ctx.clienteId) {
      return {
        sucesso: false,
        erro:    'Acesso negado: não é possível alterar a forma de pagamento de outro cliente.',
        resumo:  'Acesso negado.',
      }
    }

    try {
      await alterarFormaPagamentoAsaas(clienteId, parsed.data.forma)

      const formaLabel = FORMA_PT[parsed.data.forma] ?? parsed.data.forma

      return {
        sucesso: true,
        dados:   { forma: parsed.data.forma },
        resumo:  `✅ Forma de pagamento alterada para **${formaLabel}**. As próximas cobranças serão geradas nessa modalidade.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[tool/alterarFormaPagamento] erro:', err)
      Sentry.captureException(err, {
        tags:  { module: 'tool', operation: 'alterarFormaPagamento' },
        extra: { clienteId, canal: ctx.solicitanteAI, forma: parsed.data.forma },
      })
      return { sucesso: false, erro: msg, resumo: 'Erro ao alterar forma de pagamento.' }
    }
  },
}

registrarTool(alterarFormaPagamentoTool)
