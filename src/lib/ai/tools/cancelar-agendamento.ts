import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const cancelarAgendamentoTool: Tool = {
  definition: {
    name: 'cancelarAgendamento',
    description:
      'Cancela (desativa) um agendamento recorrente do agente. Use quando o operador disser "não precisa mais daquele relatório", "cancela o agendamento de segunda", "para de me mandar aquele email automático", etc. Pode buscar por id ou por trecho da descrição.',
    inputSchema: {
      type: 'object',
      properties: {
        agendamentoId: {
          type: 'string',
          description: 'ID exato do agendamento a cancelar.',
        },
        descricao: {
          type: 'string',
          description: 'Trecho da descrição para buscar o agendamento quando não se sabe o ID. Ex: "relatório de segunda".',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Cancelar agendamento',
    descricao: 'Desativa um agendamento recorrente para que o agente pare de executá-lo automaticamente.',
    categoria: 'Tarefas',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const agendamentoId = input.agendamentoId as string | undefined
    const descricao     = input.descricao     as string | undefined

    if (!agendamentoId && !descricao) {
      return {
        sucesso: false,
        erro:   'Forneça agendamentoId ou um trecho da descrição.',
        resumo: 'Informe o id ou um trecho da descrição do agendamento a cancelar. Use listarAgendamentos para ver os disponíveis.',
      }
    }

    // Busca o agendamento
    let agendamento
    if (agendamentoId) {
      agendamento = await prisma.agendamentoAgente.findUnique({ where: { id: agendamentoId } })
    } else {
      agendamento = await prisma.agendamentoAgente.findFirst({
        where: {
          ativo:     true,
          descricao: { contains: descricao!, mode: 'insensitive' },
        },
      })
    }

    if (!agendamento) {
      return {
        sucesso: false,
        erro:   'Agendamento não encontrado.',
        resumo: `Nenhum agendamento encontrado${descricao ? ` com "${descricao}" na descrição` : ''}. Use listarAgendamentos para ver os disponíveis.`,
      }
    }

    if (!agendamento.ativo) {
      return {
        sucesso: true,
        dados:   { agendamentoId: agendamento.id },
        resumo:  `O agendamento "${agendamento.descricao}" já estava inativo.`,
      }
    }

    await prisma.agendamentoAgente.update({
      where: { id: agendamento.id },
      data:  { ativo: false },
    })

    return {
      sucesso: true,
      dados:   { agendamentoId: agendamento.id },
      resumo:  `Agendamento "${agendamento.descricao}" cancelado. O agente não executará mais essa tarefa automaticamente.`,
    }
  },
}

registrarTool(cancelarAgendamentoTool)
