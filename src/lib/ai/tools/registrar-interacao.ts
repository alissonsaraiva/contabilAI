import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const registrarInteracaoTool: Tool = {
  definition: {
    name: 'registrarInteracao',
    description: 'Registra uma interação no histórico de um cliente ou lead (ligação realizada, email enviado, reunião, nota interna, etc.). Use quando o operador disser "registra que liguei", "anota que enviamos email", "adiciona uma observação", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['ligacao', 'email_enviado', 'email_recebido', 'nota_interna', 'whatsapp_enviado'],
          description: 'Tipo da interação.',
        },
        titulo: {
          type: 'string',
          description: 'Título ou assunto da interação. Ex: "Ligação de follow-up sobre DAS".',
        },
        conteudo: {
          type: 'string',
          description: 'Detalhes adicionais, observações ou resumo da interação (opcional).',
        },
        clienteId: {
          type: 'string',
          description: 'ID do cliente. Usar quando for um cliente (não lead).',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead. Usar quando for um lead em prospecção/onboarding.',
        },
      },
      required: ['tipo', 'titulo'],
    },
  },

  meta: {
    label: 'Registrar interação',
    descricao: 'Loga ligação, e-mail, nota interna ou mensagem WhatsApp como interação do cliente ou lead.',
    categoria: 'Histórico',
    canais: ['crm'],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const tipo      = input.tipo      as string
    const titulo    = input.titulo    as string
    const conteudo  = input.conteudo  as string | undefined
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    const leadId    = (input.leadId    as string | undefined) ?? ctx.leadId

    if (!clienteId && !leadId) {
      return {
        sucesso: false,
        erro: 'Forneça clienteId ou leadId para registrar a interação.',
        resumo: 'Não foi possível registrar a interação: cliente/lead não identificado.',
      }
    }

    const interacao = await prisma.interacao.create({
      data: {
        clienteId,
        leadId,
        tipo:     tipo as never,
        titulo,
        conteudo,
        metadados: { registradoPorAI: true, solicitante: ctx.solicitanteAI },
      },
    })

    const tipoLabel: Record<string, string> = {
      ligacao:          'Ligação',
      email_enviado:    'Email enviado',
      email_recebido:   'Email recebido',
      nota_interna:     'Nota interna',
      whatsapp_enviado: 'Mensagem WhatsApp',
    }

    return {
      sucesso: true,
      dados: interacao,
      resumo: `Interação registrada: ${tipoLabel[tipo] ?? tipo} — "${titulo}".`,
    }
  },
}

registrarTool(registrarInteracaoTool)
