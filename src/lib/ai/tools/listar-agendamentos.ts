import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const listarAgendamentosTool: Tool = {
  definition: {
    name: 'listarAgendamentos',
    description:
      'Lista os agendamentos ativos do agente. Use quando o operador perguntar "o que está agendado?", "quais são os relatórios automáticos?", "tenho algum agendamento?", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        incluirInativos: {
          type: 'boolean',
          description: 'Se true, inclui também agendamentos cancelados/inativos. Default: false.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Listar agendamentos',
    descricao: 'Lista todos os agendamentos recorrentes ativos do agente operacional.',
    categoria: 'Tarefas',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const incluirInativos = (input.incluirInativos as boolean | undefined) ?? false

    const agendamentos = await prisma.agendamentoAgente.findMany({
      where:   incluirInativos ? {} : { ativo: true },
      orderBy: { proximoDisparo: 'asc' },
    })

    if (agendamentos.length === 0) {
      return {
        sucesso: true,
        dados:   [],
        resumo:  incluirInativos
          ? 'Nenhum agendamento encontrado.'
          : 'Nenhum agendamento ativo. Use criarAgendamento para criar um.',
      }
    }

    const linhas = agendamentos.map(a => {
      const status  = a.ativo ? '✓ ativo' : '✗ inativo'
      const proximo = a.proximoDisparo
        ? `próximo: ${new Date(a.proximoDisparo).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
        : 'sem próximo disparo'
      const ultimo = a.ultimoDisparo
        ? `, último: ${new Date(a.ultimoDisparo).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
        : ''
      return `• [${status}] "${a.descricao}" (cron: ${a.cron}) — ${proximo}${ultimo} | id: ${a.id}`
    })

    return {
      sucesso: true,
      dados:   agendamentos,
      resumo:  [
        `${agendamentos.length} agendamento${agendamentos.length > 1 ? 's' : ''}:`,
        ...linhas,
      ].join('\n'),
    }
  },
}

registrarTool(listarAgendamentosTool)
