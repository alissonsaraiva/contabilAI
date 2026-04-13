import { z } from 'zod'
import { registrarTool } from './registry'
import { entregarNotaCliente } from '@/lib/services/notas-fiscais'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const enviarNotaFiscalClienteTool: Tool = {
  definition: {
    name: 'enviarNotaFiscalCliente',
    description:
      'Envia/reentrega uma NFS-e autorizada ao cliente via WhatsApp ou e-mail, com PDF e XML anexados. ' +
      'Use quando o cliente pedir "me manda a nota", "não recebi a nota", "pode reenviar o PDF?", "preciso do XML", "envia no meu e-mail". ' +
      'Só funciona para notas com status "autorizada". ' +
      'Se o canal for "portal", oriente o cliente a acessar o portal onde pode baixar PDF e XML individualmente.',
    inputSchema: {
      type: 'object',
      properties: {
        notaFiscalId: {
          type: 'string',
          description: 'ID interno da nota fiscal a entregar.',
        },
        canal: {
          type: 'string',
          enum: ['whatsapp', 'email', 'portal'],
          description: 'Canal de entrega. "portal" apenas informa onde baixar.',
        },
      },
      required: ['notaFiscalId', 'canal'],
    },
  },

  meta: {
    label: 'Enviar nota fiscal ao cliente',
    descricao: 'Reenvia NFS-e autorizada ao cliente via WhatsApp ou e-mail.',
    categoria: 'Nota Fiscal',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    // Quando chamado pelo portal e nenhum canal foi especificado, default para 'portal'
    // (o cliente já está no portal e pode baixar direto — não precisa enviar via WhatsApp)
    const inputComDefault = {
      ...input,
      canal: input.canal ?? (ctx.solicitanteAI === 'portal' ? 'portal' : undefined),
    }

    const parsed = z.object({
      notaFiscalId: z.string().min(1),
      canal:        z.enum(['whatsapp', 'email', 'portal']),
    }).safeParse(inputComDefault)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]!
      return {
        sucesso: false,
        erro:    issue.message,
        resumo:  `Parâmetro inválido: ${issue.message}`,
      }
    }

    if (parsed.data.canal === 'portal') {
      return {
        sucesso: true,
        resumo:  'O cliente pode baixar a nota fiscal diretamente no portal do cliente, na seção "Notas Fiscais". Oriente-o a acessar e fazer o download.',
      }
    }

    try {
      await entregarNotaCliente(
        parsed.data.notaFiscalId,
        parsed.data.canal,
      )
      const canalLabel = parsed.data.canal === 'whatsapp' ? 'WhatsApp' : 'e-mail'
      return {
        sucesso: true,
        dados:   { notaFiscalId: parsed.data.notaFiscalId, canal: parsed.data.canal },
        resumo:  `Nota fiscal enviada com sucesso via ${canalLabel}.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      return { sucesso: false, erro: msg, resumo: `Não foi possível enviar a nota: ${msg}` }
    }
  },
}

registrarTool(enviarNotaFiscalClienteTool)
