import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { atualizarVencimentoAsaas } from '@/lib/services/asaas-sync'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const alterarVencimentoCobrancaTool: Tool = {
  definition: {
    name: 'alterarVencimentoCobranca',
    description:
      'Altera o dia de vencimento da mensalidade do cliente (entre 1 e 28). ' +
      'Use quando: cliente pedir "quero vencer no dia 5", "mudar meu vencimento para dia 10", "boleto todo dia 15", etc. ' +
      'No portal/WhatsApp usa o clienteId do contexto automaticamente.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. No portal/WhatsApp é preenchido pelo contexto automaticamente.',
        },
        dia: {
          type: 'number',
          description: 'Novo dia de vencimento, entre 1 e 28.',
        },
      },
      required: ['dia'],
    },
  },

  meta: {
    label: 'Alterar dia de vencimento',
    descricao: 'Muda o dia de vencimento da mensalidade do cliente na assinatura Asaas.',
    categoria: 'Financeiro',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      clienteId: z.string().optional(),
      dia:       z.number().int().min(1).max(28),
    }).safeParse(input)

    if (!parsed.success) {
      return { sucesso: false, erro: parsed.error.issues[0].message, resumo: 'Parâmetros inválidos.' }
    }

    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    if (!clienteId) {
      return {
        sucesso: false,
        erro:    'clienteId não disponível no contexto.',
        resumo:  'Não foi possível identificar o cliente para alterar o vencimento.',
      }
    }

    // No portal/whatsapp, bloqueia alteração de outro cliente
    const isCanalRestrito = ctx.solicitanteAI === 'portal' || ctx.solicitanteAI === 'whatsapp'
    if (isCanalRestrito && parsed.data.clienteId && parsed.data.clienteId !== ctx.clienteId) {
      return {
        sucesso: false,
        erro:    'Acesso negado: não é possível alterar o vencimento de outro cliente.',
        resumo:  'Acesso negado.',
      }
    }

    try {
      const { proximoVencimento } = await atualizarVencimentoAsaas(clienteId, parsed.data.dia)

      return {
        sucesso: true,
        dados:   { dia: parsed.data.dia, proximoVencimento },
        resumo:  `✅ Vencimento alterado para o dia ${parsed.data.dia}. Próximo vencimento: ${new Date(proximoVencimento).toLocaleDateString('pt-BR')}.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[tool/alterarVencimentoCobranca] erro:', err)
      Sentry.captureException(err, {
        tags:  { module: 'tool', operation: 'alterarVencimentoCobranca' },
        extra: { clienteId, canal: ctx.solicitanteAI },
      })
      return { sucesso: false, erro: msg, resumo: 'Erro ao alterar vencimento.' }
    }
  },
}

registrarTool(alterarVencimentoCobrancaTool)
