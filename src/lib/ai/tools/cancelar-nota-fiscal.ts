import { z } from 'zod'
import { registrarTool } from './registry'
import { cancelarNotaFiscal } from '@/lib/services/notas-fiscais'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const cancelarNotaFiscalTool: Tool = {
  definition: {
    name: 'cancelarNotaFiscal',
    description:
      'Cancela uma NFS-e já autorizada e envia PDF+XML de cancelamento ao cliente. ' +
      'QUANDO USAR: cliente pede cancelamento ("quero cancelar a nota", "preciso cancelar a NF de fevereiro") ou operador CRM solicita. ' +
      'ATENÇÃO: cancelamento pode ser irreversível dependendo do município e prazo legal. ' +
      'FLUXO OBRIGATÓRIO: ' +
      '1) Chame consultarNotasFiscais para identificar a nota e confirmar o status "autorizada". ' +
      '2) Mostre ao solicitante: número, valor, tomador e data. ' +
      '3) Pergunte: "Confirma o cancelamento da NFS-e nº X, no valor de R$ Y, emitida para [tomador]? Essa ação pode ser irreversível. Informe o motivo." ' +
      '4) SOMENTE após confirmação explícita E motivo informado, execute o cancelamento. ' +
      '5) Após cancelamento bem-sucedido, informe que PDF e XML de cancelamento foram enviados. ' +
      'CRM: operador precisa confirmar e informar justificativa. ' +
      'WhatsApp/Portal: cliente precisa confirmar e informar o motivo.',
    inputSchema: {
      type: 'object',
      properties: {
        notaFiscalId: {
          type: 'string',
          description: 'ID interno da nota fiscal a cancelar (campo id retornado por consultarNotasFiscais).',
        },
        justificativa: {
          type: 'string',
          description: 'Motivo do cancelamento informado pelo solicitante (mínimo 15 caracteres).',
        },
        entregarApos: {
          type: 'string',
          enum: ['whatsapp', 'email'],
          description: 'Canal para envio do PDF+XML de cancelamento ao cliente após o cancelamento. Use o canal da conversa atual (whatsapp para WhatsApp, email para e-mail). Omita se o cliente estiver no portal (ele baixa pelo portal).',
        },
      },
      required: ['notaFiscalId', 'justificativa'],
    },
  },

  meta: {
    label: 'Cancelar nota fiscal',
    descricao: 'Cancela uma NFS-e autorizada e envia PDF+XML de cancelamento. Requer confirmação explícita.',
    categoria: 'Nota Fiscal',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      notaFiscalId:  z.string().min(1),
      justificativa: z.string().min(15, 'Justificativa deve ter no mínimo 15 caracteres'),
      entregarApos:  z.enum(['whatsapp', 'email']).optional(),
    }).safeParse(input)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]!
      return {
        sucesso: false,
        erro:    issue.message,
        resumo:  `Parâmetro inválido: ${issue.message}`,
      }
    }

    try {
      const resultado = await cancelarNotaFiscal(
        parsed.data.notaFiscalId,
        parsed.data.justificativa,
        parsed.data.entregarApos,
      )

      if (!resultado.sucesso) {
        return {
          sucesso: false,
          erro:    resultado.detalhe,
          resumo:  `Cancelamento não realizado: ${resultado.detalhe}`,
        }
      }

      const entregaMsg = parsed.data.entregarApos
        ? ` PDF e XML de cancelamento enviados via ${parsed.data.entregarApos === 'whatsapp' ? 'WhatsApp' : 'e-mail'}.`
        : ctx.solicitanteAI === 'portal'
          ? ' O cliente pode baixar o PDF e XML de cancelamento diretamente no portal.'
          : ''

      return {
        sucesso: true,
        dados:   { notaFiscalId: parsed.data.notaFiscalId },
        resumo:  `NFS-e cancelada com sucesso.${entregaMsg}`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      return { sucesso: false, erro: msg, resumo: `Erro ao cancelar nota: ${msg}` }
    }
  },
}

registrarTool(cancelarNotaFiscalTool)
