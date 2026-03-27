import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const concluirTarefaTool: Tool = {
  definition: {
    name: 'concluirTarefa',
    description:
      'Marca uma tarefa como concluída ou atualiza seu status. Use quando o operador disser "conclui a tarefa X", "marca como feito", "atualiza o status da tarefa para em andamento", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        tarefaId: {
          type: 'string',
          description: 'ID da tarefa a atualizar.',
        },
        status: {
          type: 'string',
          enum: ['pendente', 'em_andamento', 'aguardando_cliente', 'concluida', 'cancelada'],
          description: 'Novo status da tarefa. Default: "concluida".',
        },
        observacao: {
          type: 'string',
          description: 'Nota ou observação sobre o resultado da tarefa (opcional). Ex: "Cliente confirmou recebimento". Appended à descrição da tarefa.',
        },
      },
      required: ['tarefaId'],
    },
  },

  meta: {
    label: 'Concluir tarefa',
    descricao: 'Marca uma tarefa como concluída ou atualiza seu status (em andamento, aguardando cliente, cancelada).',
    categoria: 'Tarefas',
    canais: ['crm', 'whatsapp'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const tarefaId   = input.tarefaId  as string
    const status     = (input.status as string | undefined) ?? 'concluida'
    const observacao = input.observacao as string | undefined

    const tarefa = await prisma.tarefa.findUnique({
      where:  { id: tarefaId },
      select: { id: true, titulo: true, status: true, descricao: true },
    })

    if (!tarefa) {
      return {
        sucesso: false,
        erro:   `Tarefa ${tarefaId} não encontrada.`,
        resumo: 'Tarefa não encontrada.',
      }
    }

    // Append da observação na descrição existente
    const novaDescricao = observacao
      ? [tarefa.descricao, `[${new Date().toLocaleDateString('pt-BR')}] ${observacao}`].filter(Boolean).join('\n\n')
      : undefined

    const updated = await prisma.tarefa.update({
      where: { id: tarefaId },
      data: {
        status:      status as never,
        concluidaEm: status === 'concluida' ? new Date() : null,
        ...(novaDescricao !== undefined ? { descricao: novaDescricao } : {}),
      },
    })

    import('@/lib/rag/ingest').then(({ indexarTarefa }) => indexarTarefa(updated)).catch(() => {})

    const statusLabel: Record<string, string> = {
      pendente:          'Pendente',
      em_andamento:      'Em andamento',
      aguardando_cliente:'Aguardando cliente',
      concluida:         'Concluída',
      cancelada:         'Cancelada',
    }

    return {
      sucesso: true,
      dados:   { tarefaId, status: updated.status },
      resumo:  `Tarefa "${tarefa.titulo}" marcada como ${statusLabel[status] ?? status}.${observacao ? ` Observação registrada.` : ''}`,
    }
  },
}

registrarTool(concluirTarefaTool)
