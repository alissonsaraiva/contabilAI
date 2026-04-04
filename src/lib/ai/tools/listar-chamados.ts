import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const listarChamadosTool: Tool = {
  definition: {
    name: 'listarChamados',
    description: 'Lista os chamados abertos pelos clientes via portal. Filtra por status (aberta, em_andamento, aguardando_cliente, resolvida, cancelada) ou por cliente. Use para ver a fila de suporte, checar se um cliente tem chamados em aberto, ou relatório de atendimentos.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente para filtrar os chamados. Se omitido, retorna de todos os clientes.',
        },
        status: {
          type: 'string',
          enum: ['aberta', 'em_andamento', 'aguardando_cliente', 'resolvida', 'cancelada'],
          description: 'Filtro por status. Se omitido, retorna apenas chamados abertos (aberta + em_andamento + aguardando_cliente).',
        },
        limite: {
          type: 'number',
          description: 'Número máximo de chamados a retornar. Default: 10.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Listar chamados (portal)',
    descricao: 'Lista os chamados abertos pelos clientes no portal. Filtrável por status e cliente.',
    categoria: 'Portal',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    const status    = input.status  as string | undefined
    const limite    = Math.min(Number(input.limite ?? 10), 50)

    // Segurança: no canal portal, o clienteId é obrigatório — o cliente nunca
    // pode ver chamados de outras empresas por ausência de contexto.
    if (!clienteId && ctx.solicitanteAI === 'portal') {
      return {
        sucesso: false,
        erro: 'Contexto de cliente não identificado.',
        resumo: 'Não foi possível listar chamados: cliente não identificado na sessão.',
      }
    }

    const where: any = {}
    if (clienteId)  where.clienteId = clienteId
    if (status) {
      where.status = status
    } else {
      where.status = { in: ['aberta', 'em_andamento', 'aguardando_cliente'] }
    }

    const ordens = await prisma.chamado.findMany({
      where,
      orderBy: [{ prioridade: 'desc' }, { criadoEm: 'desc' }],
      take:    limite,
      include: {
        cliente: { select: { nome: true, email: true } },
        empresa: { select: { razaoSocial: true, nomeFantasia: true } },
      },
    })

    if (ordens.length === 0) {
      return { sucesso: true, dados: [], resumo: 'Nenhum chamado encontrado com os filtros informados.' }
    }

    const linhas = ordens.map(o => {
      const empresa = o.empresa?.razaoSocial ?? o.empresa?.nomeFantasia ?? ''
      return `- #${o.numero} [${o.status.toUpperCase()}] "${o.titulo}" (${o.cliente.nome}${empresa ? ` / ${empresa}` : ''}) — ${o.tipo} — ${new Date(o.criadoEm).toLocaleDateString('pt-BR')}`
    })

    return {
      sucesso: true,
      dados:   ordens,
      resumo:  `${ordens.length} chamado(s) encontrado(s):\n${linhas.join('\n')}`,
    }
  },
}

registrarTool(listarChamadosTool)
