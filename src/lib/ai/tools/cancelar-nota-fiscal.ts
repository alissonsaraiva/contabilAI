import { z } from 'zod'
import { registrarTool } from './registry'
import { cancelarNotaFiscal } from '@/lib/services/notas-fiscais'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const cancelarNotaFiscalTool: Tool = {
  definition: {
    name: 'cancelarNotaFiscal',
    description:
      'Cancela uma NFS-e já autorizada. ' +
      'ATENÇÃO: o cancelamento pode ser irreversível dependendo do município e do prazo legal. ' +
      'SEMPRE peça confirmação explícita do operador antes de executar. ' +
      'Pergunte: "Confirma o cancelamento da NFS-e nº X, no valor de R$ Y, para [tomador]? Essa ação pode não ser reversível." ' +
      'Exija justificativa (mínimo 15 caracteres) antes de chamar.',
    inputSchema: {
      type: 'object',
      properties: {
        notaFiscalId: {
          type: 'string',
          description: 'ID interno da nota fiscal a cancelar.',
        },
        justificativa: {
          type: 'string',
          description: 'Justificativa do cancelamento (mínimo 15 caracteres).',
        },
      },
      required: ['notaFiscalId', 'justificativa'],
    },
  },

  meta: {
    label: 'Cancelar nota fiscal',
    descricao: 'Cancela uma NFS-e autorizada. Apenas CRM — requer confirmação explícita.',
    categoria: 'Nota Fiscal',
    canais: ['crm'],  // cliente nunca cancela sozinho
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      notaFiscalId:  z.string().min(1),
      justificativa: z.string().min(15, 'Justificativa deve ter no mínimo 15 caracteres'),
    }).safeParse(input)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
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
      )

      if (!resultado.sucesso) {
        return {
          sucesso: false,
          erro:    resultado.detalhe,
          resumo:  `Cancelamento não realizado: ${resultado.detalhe}`,
        }
      }

      return {
        sucesso: true,
        dados:   { notaFiscalId: parsed.data.notaFiscalId },
        resumo:  'NFS-e cancelada com sucesso.',
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      return { sucesso: false, erro: msg, resumo: `Erro ao cancelar nota: ${msg}` }
    }
  },
}

registrarTool(cancelarNotaFiscalTool)
