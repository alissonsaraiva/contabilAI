/**
 * Tool: anexarDocumentoChat
 *
 * Cadastra no CRM um documento que o cliente enviou via chat (WhatsApp ou portal).
 * Deve ser chamada SOMENTE após confirmação explícita do cliente de que deseja o cadastro.
 *
 * Fluxo:
 *   1. Busca a MensagemIA mais recente com mediaBuffer na conversa atual
 *   2. Faz upload para S3 via criarDocumento
 *   3. Cria o registro Documento vinculado ao cliente/lead
 *   4. Indexa no RAG e dispara geração de resumo IA
 */

import { prisma } from '@/lib/prisma'
import { criarDocumento } from '@/lib/services/documentos'
import type { CategoriaDocumento } from '@prisma/client'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

// Mapeamento tipo classificado → label legível e categoria do CRM
const TIPO_LABELS: Record<string, string> = {
  nota_fiscal:           'Nota Fiscal',
  comprovante_pagamento: 'Comprovante de Pagamento',
  extrato_bancario:      'Extrato Bancário',
  holerite:              'Holerite',
  boleto:                'Boleto',
  contrato:              'Contrato',
  documento_pessoal:     'Documento Pessoal',
  outro:                 'Documento',
}

function mapTipoParaCategoria(tipo: string): CategoriaDocumento {
  switch (tipo) {
    case 'nota_fiscal':      return 'nota_fiscal'
    case 'extrato_bancario': return 'relatorios'
    case 'imposto_renda':    return 'imposto_renda'
    case 'guia_tributos':    return 'guias_tributos'
    default:                 return 'geral'
  }
}

const anexarDocumentoChatTool: Tool = {
  definition: {
    name: 'anexarDocumentoChat',
    description: 'Cadastra no sistema um documento enviado pelo cliente via chat (WhatsApp ou portal). Use SOMENTE após o cliente confirmar que deseja o cadastro. Busca automaticamente o arquivo da conversa atual.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          description: 'Tipo do documento identificado (ex: holerite, nota_fiscal, comprovante_pagamento). Informe o tipo que foi classificado para categorizar corretamente.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Anexar documento do chat',
    descricao: 'Cadastra no CRM um documento enviado pelo cliente via WhatsApp ou portal, após confirmação explícita.',
    categoria: 'Documentos',
    canais: ['whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const { clienteId, leadId, conversaId, solicitanteAI } = ctx
    const tipoInput = (input.tipo as string | undefined)?.toLowerCase().trim()

    if (!clienteId && !leadId) {
      return { sucesso: false, erro: 'Nenhum cliente ou lead identificado na conversa.', resumo: 'Não foi possível identificar o cliente. O documento não foi cadastrado.' }
    }
    if (!conversaId) {
      return { sucesso: false, erro: 'conversaId não disponível no contexto.', resumo: 'Erro interno: conversa não identificada. O documento não foi cadastrado.' }
    }

    // Busca a mensagem mais recente desta conversa que tenha buffer de mídia
    const mensagem = await prisma.mensagemIA.findFirst({
      where: {
        conversaId,
        role:        'user',
        mediaBuffer: { not: null },
      },
      orderBy: { criadaEm: 'desc' },
      select: {
        id:            true,
        mediaBuffer:   true,
        mediaMimeType: true,
        mediaFileName: true,
      },
    }).catch(() => null)

    if (!mensagem?.mediaBuffer) {
      return {
        sucesso: false,
        erro:    'Nenhum arquivo encontrado na conversa para cadastrar.',
        resumo:  'Não encontrei nenhum arquivo enviado nesta conversa. Peça ao cliente que reenvie o documento.',
      }
    }

    const tipoLabel   = tipoInput ? (TIPO_LABELS[tipoInput] ?? 'Documento') : 'Documento'
    const categoria   = tipoInput ? mapTipoParaCategoria(tipoInput) : 'geral'
    const mimeType    = mensagem.mediaMimeType ?? 'application/octet-stream'
    const fileName    = mensagem.mediaFileName ?? `documento_${Date.now()}.bin`
    const canal       = solicitanteAI === 'portal' ? 'portal' : 'whatsapp'

    // Busca empresaId do cliente para vincular também à empresa (PJ)
    let empresaId: string | undefined
    if (clienteId) {
      const cliente = await prisma.cliente.findUnique({
        where:  { id: clienteId },
        select: { empresaId: true },
      }).catch(() => null)
      empresaId = cliente?.empresaId ?? undefined
    }

    try {
      const doc = await criarDocumento({
        clienteId,
        empresaId,
        leadId,
        arquivo: {
          buffer:   mensagem.mediaBuffer as Buffer,
          nome:     fileName,
          mimeType,
        },
        tipo:      tipoLabel,
        categoria,
        origem:    canal as 'whatsapp' | 'portal',
        metadados: {
          tipoClassificado: tipoInput ?? null,
          conversaId,
          canal,
        },
      })

      return {
        sucesso: true,
        dados:   { documentoId: doc.id, nome: doc.nome, categoria: doc.categoria },
        resumo:  `Documento "${doc.nome}" cadastrado com sucesso no sistema (${tipoLabel}). O cliente pode visualizá-lo na aba de documentos.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[anexar-documento-chat] erro ao criar documento:', { clienteId, leadId, conversaId, err })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  'Ocorreu um erro ao cadastrar o documento. Peça ao cliente que tente novamente ou acione um atendente humano.',
      }
    }
  },
}

registrarTool(anexarDocumentoChatTool)
