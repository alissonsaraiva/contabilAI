import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { resolverEmpresasDoCliente } from './resolver-empresa'
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

    // Agrega documentos de TODAS as empresas vinculadas ao cliente (1:N)
    const orConditions: object[] = []
    if (clienteId) {
      orConditions.push({ clienteId })
      try {
        const empresas = await resolverEmpresasDoCliente(clienteId)
        for (const emp of empresas) {
          orConditions.push({ empresaId: emp.empresaId })
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags:  { module: 'buscar-documentos', operation: 'resolve-empresas' },
          extra: { clienteId },
        })
      }
    }
    if (empresaId && !orConditions.some((c: any) => c.empresaId === empresaId)) {
      orConditions.push({ empresaId })
    }
    if (leadId) orConditions.push({ leadId })

    const documentos = await prisma.documento.findMany({
      where: {
        OR: orConditions,
        deletadoEm: null,
        ...(categoria && { categoria: categoria as never }),
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
        resumo:    true,
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
      whatsapp:   'cliente (WhatsApp)',
      email:      'cliente (email)',
    }

    const linhas = documentos.map(d => {
      const data   = new Date(d.criadoEm).toLocaleDateString('pt-BR')
      const origem = origemLabel[d.origem] ?? d.origem
      const resumo = d.resumo ? ` | ${d.resumo}` : ''
      return `• [${data}] ${d.categoria ?? d.tipo} — ${d.nome} (enviado por: ${origem})${resumo} | id: ${d.id}`
    })

    // Avisa quando o documento mais recente é antigo (> 6 meses) para o agente não
    // enviá-lo como "mais recente" sem alertar o cliente da data.
    const maisRecente    = documentos[0]
    const idadeMeses     = maisRecente
      ? (Date.now() - new Date(maisRecente.criadoEm).getTime()) / (1000 * 60 * 60 * 24 * 30)
      : 0
    const avisoAntiguidade = idadeMeses > 6
      ? `\nATENÇÃO: o documento mais recente tem ${Math.round(idadeMeses)} meses. Informe a data ao cliente antes de enviar.`
      : ''

    // No portal, o cliente está autenticado — retorna links de download diretos.
    // No CRM/WhatsApp, instrui o agente a usar enviarDocumentoWhatsApp.
    const portalBase = (process.env.NEXT_PUBLIC_PORTAL_URL ?? '').replace(/\/$/, '')
    const instrucaoEntrega = ctx.solicitanteAI === 'portal'
      ? documentos.map(d =>
          `• "${d.nome}": ${portalBase}/api/portal/documentos/${d.id}/download`
        ).join('\n') +
        '\n\nApresente cada link acima exatamente como está (URL completa). Não modifique as URLs. Use formato: [nome do documento](url completa).'
      : 'Para enviar via WhatsApp, use enviarDocumentoWhatsApp com o id do documento.'

    return {
      sucesso: true,
      dados:   documentos,
      resumo:  [
        `${documentos.length} documento${documentos.length > 1 ? 's' : ''} encontrado${documentos.length > 1 ? 's' : ''}:`,
        ...linhas,
        '',
        instrucaoEntrega + avisoAntiguidade,
      ].join('\n'),
    }
  },
}

registrarTool(buscarDocumentosTool)
