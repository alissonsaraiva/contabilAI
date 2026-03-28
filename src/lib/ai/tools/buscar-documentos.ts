import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const buscarDocumentosTool: Tool = {
  definition: {
    name: 'buscarDocumentos',
    description:
      'Lista os documentos disponíveis de um cliente ou lead: notas fiscais, boletos, contratos, comprovantes, etc. Use quando o cliente perguntar "tem minha nota fiscal?", "quero ver meu contrato", "me envia o boleto", "quais documentos vocês têm meus?", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente (PF ou responsável PJ).',
        },
        empresaId: {
          type: 'string',
          description: 'ID da empresa (para clientes PJ — busca documentos vinculados à empresa).',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead.',
        },
        categoria: {
          type: 'string',
          enum: ['geral', 'nota_fiscal', 'imposto_renda', 'guias_tributos', 'relatorios', 'outros'],
          description: 'Filtrar por categoria de documento. Opcional.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Buscar documentos',
    descricao: 'Lista documentos disponíveis do cliente ou lead: notas fiscais, boletos, contratos e comprovantes.',
    categoria: 'Clientes',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    const empresaId = input.empresaId  as string | undefined
    const leadId    = (input.leadId    as string | undefined) ?? ctx.leadId
    const categoria = input.categoria  as string | undefined

    if (!clienteId && !empresaId && !leadId) {
      return {
        sucesso: false,
        erro:   'clienteId, empresaId ou leadId não fornecido.',
        resumo: 'Não foi possível buscar documentos: cliente, empresa ou lead não identificado.',
      }
    }

    const documentos = await prisma.documento.findMany({
      where: {
        ...(clienteId  && { clienteId }),
        ...(empresaId  && { empresaId }),
        ...(leadId     && { leadId }),
        ...(categoria  && { categoria: categoria as never }),
      },
      orderBy: { criadoEm: 'desc' },
      take:    20,
      select: {
        id:        true,
        nome:      true,
        tipo:      true,
        categoria: true,
        origem:    true,
        url:       true,
        mimeType:  true,
        status:    true,
        criadoEm:  true,
      },
    })

    if (documentos.length === 0) {
      const filtroMsg = categoria ? ` da categoria "${categoria}"` : ''
      return {
        sucesso: true,
        dados:   [],
        resumo:  `Nenhum documento encontrado${filtroMsg}.`,
      }
    }

    const origemLabel: Record<string, string> = {
      crm:        'escritório',
      portal:     'cliente',
      integracao: 'integração',
    }

    const linhas = documentos.map(d => {
      const data   = new Date(d.criadoEm).toLocaleDateString('pt-BR')
      const origem = origemLabel[d.origem] ?? d.origem
      return `• [${data}] ${d.categoria ?? d.tipo} — ${d.nome} (enviado por: ${origem}) | id: ${d.id}`
    })

    return {
      sucesso: true,
      dados:   documentos,
      resumo:  [
        `${documentos.length} documento${documentos.length > 1 ? 's' : ''} encontrado${documentos.length > 1 ? 's' : ''}:`,
        ...linhas,
        '',
        'Apresente os documentos como links clicáveis para o cliente baixar. Para enviar via WhatsApp, use enviarDocumentoWhatsApp com o id do documento.',
      ].join('\n'),
    }
  },
}

registrarTool(buscarDocumentosTool)
