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
          description: 'ID do cliente.',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead.',
        },
        tipo: {
          type: 'string',
          description: 'Filtrar por tipo de documento (ex: nota_fiscal, boleto, contrato, comprovante). Opcional.',
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
    const leadId    = (input.leadId    as string | undefined) ?? ctx.leadId
    const tipo      = input.tipo       as string | undefined

    if (!clienteId && !leadId) {
      return {
        sucesso: false,
        erro:   'clienteId ou leadId não fornecido.',
        resumo: 'Não foi possível buscar documentos: cliente ou lead não identificado.',
      }
    }

    const documentos = await prisma.documento.findMany({
      where: {
        ...(clienteId && { clienteId }),
        ...(leadId    && { leadId }),
        ...(tipo      && { tipo: { contains: tipo, mode: 'insensitive' } }),
      },
      orderBy: { criadoEm: 'desc' },
      take:    20,
      select: {
        id:        true,
        nome:      true,
        tipo:      true,
        url:       true,
        mimeType:  true,
        status:    true,
        criadoEm:  true,
      },
    })

    if (documentos.length === 0) {
      const filtroMsg = tipo ? ` do tipo "${tipo}"` : ''
      return {
        sucesso: true,
        dados:   [],
        resumo:  `Nenhum documento encontrado${filtroMsg}.`,
      }
    }

    const linhas = documentos.map(d => {
      const data = new Date(d.criadoEm).toLocaleDateString('pt-BR')
      return `• [${data}] ${d.tipo} — ${d.nome} | URL: ${d.url} | id: ${d.id}`
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
