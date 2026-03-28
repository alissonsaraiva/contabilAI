import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const listarTarefasTool: Tool = {
  definition: {
    name: 'listarTarefas',
    description: 'Lista tarefas do CRM com filtros por status, prioridade, vencimento ou cliente. Use para responder perguntas como "quais tarefas estão atrasadas", "o que tenho pra fazer hoje", "tarefas urgentes", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'Filtrar tarefas de um cliente específico.',
        },
        status: {
          type: 'string',
          enum: ['pendente', 'em_andamento', 'aguardando_cliente', 'concluida', 'cancelada'],
          description: 'Filtrar por status. Se omitido, retorna pendente + em_andamento.',
        },
        prioridade: {
          type: 'string',
          enum: ['baixa', 'media', 'alta', 'urgente'],
          description: 'Filtrar por prioridade.',
        },
        atrasadas: {
          type: 'boolean',
          description: 'Se true, retorna apenas tarefas com prazo vencido.',
        },
        vencendoHoje: {
          type: 'boolean',
          description: 'Se true, retorna apenas tarefas com prazo hoje.',
        },
        limite: {
          type: 'number',
          description: 'Máximo de tarefas a retornar. Default: 10.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Listar tarefas',
    descricao: 'Lista tarefas com filtros por cliente, status, prioridade, vencidas hoje ou urgentes.',
    categoria: 'Tarefas',
    canais: [], // DEPRECADA — usar listarOrdensServico
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId   = (input.clienteId  as string  | undefined) ?? ctx.clienteId
    const status      = input.status      as string  | undefined
    const prioridade  = input.prioridade  as string  | undefined
    const atrasadas   = input.atrasadas   as boolean | undefined
    const vencendoHoje = input.vencendoHoje as boolean | undefined
    const limite      = (input.limite     as number  | undefined) ?? 10

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const amanha = new Date(hoje.getTime() + 86_400_000)

    const tarefas = await prisma.tarefa.findMany({
      where: {
        ...(clienteId ? { clienteId } : {}),
        ...(prioridade ? { prioridade: prioridade as never } : {}),
        ...(status
          ? { status: status as never }
          : { status: { in: ['pendente', 'em_andamento', 'aguardando_cliente'] as never[] } }
        ),
        ...(atrasadas    ? { prazo: { lt: hoje }, status: { notIn: ['concluida', 'cancelada'] as never[] } } : {}),
        ...(vencendoHoje ? { prazo: { gte: hoje, lt: amanha } } : {}),
      },
      include: {
        cliente: { select: { nome: true } },
        responsavel: { select: { nome: true } },
      },
      orderBy: [
        { prioridade: 'desc' },
        { prazo: 'asc' },
      ],
      take: limite,
    })

    if (tarefas.length === 0) {
      return {
        sucesso: true,
        dados: [],
        resumo: 'Nenhuma tarefa encontrada para os filtros informados.',
      }
    }

    const prioridadeEmoji: Record<string, string> = {
      urgente: '🔴',
      alta:    '🟠',
      media:   '🟡',
      baixa:   '🟢',
    }

    const linhas = tarefas.map(t => {
      const emoji = prioridadeEmoji[t.prioridade] ?? '•'
      const prazo = t.prazo
        ? (t.prazo < hoje ? ` ⚠️ VENCIDA em ${t.prazo.toLocaleDateString('pt-BR')}` : ` — prazo ${t.prazo.toLocaleDateString('pt-BR')}`)
        : ''
      const cliente = t.cliente ? ` [${t.cliente.nome}]` : ''
      return `${emoji} ${t.titulo}${cliente}${prazo}`
    })

    const atrasadasCount = tarefas.filter(t => t.prazo && t.prazo < hoje).length
    const header = atrasadasCount > 0
      ? `${tarefas.length} tarefa${tarefas.length > 1 ? 's' : ''} (${atrasadasCount} atrasada${atrasadasCount > 1 ? 's' : ''}):`
      : `${tarefas.length} tarefa${tarefas.length > 1 ? 's' : ''}:`

    return {
      sucesso: true,
      dados: tarefas,
      resumo: [header, ...linhas].join('\n'),
    }
  },
}

registrarTool(listarTarefasTool)
