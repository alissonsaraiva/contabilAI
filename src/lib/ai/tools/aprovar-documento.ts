import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

/**
 * Aprova ou rejeita documentos enviados pelo cliente no portal.
 * Uma única tool unificada com campo `acao` para reduzir o número de tools no registry.
 */
const aprovarDocumentoTool: Tool = {
  definition: {
    name: 'aprovarDocumento',
    description: 'Aprova ou rejeita um documento enviado pelo cliente. Use quando o operador quiser dar feedback sobre um documento pendente de revisão. Requer o ID do documento e a ação desejada (aprovar ou rejeitar). Em caso de rejeição, informe o motivo para que o cliente possa reenviar corrigido.',
    inputSchema: {
      type: 'object',
      properties: {
        documentoId: {
          type: 'string',
          description: 'ID do documento a ser aprovado ou rejeitado.',
        },
        acao: {
          type: 'string',
          enum: ['aprovar', 'rejeitar'],
          description: 'Ação: "aprovar" para aceitar o documento ou "rejeitar" para recusar.',
        },
        motivoRejeicao: {
          type: 'string',
          description: 'Motivo da rejeição (obrigatório quando acao="rejeitar"). Será visível ao cliente.',
        },
      },
      required: ['documentoId', 'acao'],
    },
  },

  meta: {
    label: 'Aprovar/rejeitar documento',
    descricao: 'Aprova ou rejeita um documento enviado pelo cliente, com motivo de rejeição quando necessário.',
    categoria: 'Documentos',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const documentoId    = input.documentoId as string | undefined
    const acao           = input.acao as 'aprovar' | 'rejeitar' | undefined
    const motivoRejeicao = input.motivoRejeicao as string | undefined

    if (!documentoId) {
      return { sucesso: false, erro: 'documentoId obrigatório.', resumo: 'Ação cancelada: documentoId não fornecido.' }
    }
    if (!acao || !['aprovar', 'rejeitar'].includes(acao)) {
      return { sucesso: false, erro: 'acao deve ser "aprovar" ou "rejeitar".', resumo: 'Ação cancelada: acao inválida.' }
    }
    if (acao === 'rejeitar' && !motivoRejeicao?.trim()) {
      return { sucesso: false, erro: 'motivoRejeicao é obrigatório ao rejeitar.', resumo: 'Rejeição cancelada: forneça o motivo para que o cliente possa corrigir.' }
    }

    const doc = await prisma.documento.findUnique({
      where:  { id: documentoId },
      select: { id: true, nome: true, clienteId: true, leadId: true, empresaId: true, tipo: true, origem: true },
    }).catch(() => null)

    if (!doc) {
      return { sucesso: false, erro: 'Documento não encontrado.', resumo: 'Ação cancelada: documento não encontrado.' }
    }

    const novoStatus = acao === 'aprovar' ? 'aprovado' : 'rejeitado'
    const updateData: Record<string, unknown> = {
      status:        novoStatus,
      revisadoPorId: ctx.usuarioId ?? null,
      revisadoEm:    new Date(),
    }
    if (acao === 'rejeitar') updateData.motivoRejeicao = motivoRejeicao

    await prisma.documento.update({
      where: { id: documentoId },
      data:  updateData,
    }).catch(() => null)

    // Indexar no RAG para histórico do cliente
    indexarAsync('documento', {
      id:        doc.id,
      clienteId: doc.clienteId,
      leadId:    doc.leadId,
      empresaId: doc.empresaId,
      tipo:      doc.tipo,
      nome:      doc.nome,
      categoria: novoStatus,
      origem:    doc.origem,
      criadoEm:  new Date(),
    })

    const acaoStr = acao === 'aprovar' ? 'aprovado' : `rejeitado (motivo: ${motivoRejeicao})`
    return {
      sucesso: true,
      dados:   { documentoId: doc.id, status: novoStatus },
      resumo:  `Documento "${doc.nome}" ${acaoStr}.`,
    }
  },
}

registrarTool(aprovarDocumentoTool)
