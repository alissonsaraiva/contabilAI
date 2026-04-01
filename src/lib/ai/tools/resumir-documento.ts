import { registrarTool } from './registry'
import { resumirDocumento } from '@/lib/services/resumir-documento'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const resumirDocumentoTool: Tool = {
  definition: {
    name: 'resumirDocumento',
    description:
      'Regera o resumo IA de um documento específico já salvo no sistema. Use quando o operador pedir para atualizar o resumo de um documento, ou quando o resumo estiver ausente/incorreto.',
    inputSchema: {
      type: 'object',
      properties: {
        documentoId: {
          type: 'string',
          description: 'ID do documento a ser resumido.',
        },
      },
      required: ['documentoId'],
    },
  },

  meta: {
    label: 'Resumir documento',
    descricao: 'Regera o resumo IA de um documento existente.',
    categoria: 'Documentos',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const documentoId = input.documentoId as string | undefined
    if (!documentoId) {
      return { sucesso: false, erro: 'documentoId não fornecido.', resumo: 'Erro: ID do documento é obrigatório.' }
    }

    const resumo = await resumirDocumento(documentoId)

    if (!resumo) {
      return {
        sucesso: false,
        erro:    'Não foi possível gerar o resumo (formato não suportado ou sem conteúdo extraível).',
        resumo:  'Não foi possível gerar o resumo para este documento.',
      }
    }

    return {
      sucesso: true,
      dados:   { documentoId, resumo },
      resumo:  `Resumo gerado com sucesso: ${resumo}`,
    }
  },
}

registrarTool(resumirDocumentoTool)
