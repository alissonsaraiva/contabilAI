import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const criarTarefaTool: Tool = {
  definition: {
    name: 'criarTarefa',
    description: 'Cria uma nova tarefa no CRM vinculada a um cliente. Use quando o operador pedir para "criar uma tarefa", "adicionar um lembrete", "agendar um retorno" ou similar.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título da tarefa. Seja descritivo, ex: "Ligar para cliente — DAS vencido".',
        },
        clienteId: {
          type: 'string',
          description: 'ID do cliente ao qual a tarefa pertence.',
        },
        descricao: {
          type: 'string',
          description: 'Descrição adicional da tarefa (opcional).',
        },
        prioridade: {
          type: 'string',
          enum: ['baixa', 'media', 'alta', 'urgente'],
          description: 'Prioridade da tarefa. Default: "media".',
        },
        prazo: {
          type: 'string',
          description: 'Data de prazo no formato ISO 8601 (ex: 2025-04-01) ou descrição relativa como "amanhã", "próxima semana", "em 3 dias". O sistema converte para data.',
        },
      },
      required: ['titulo'],
    },
  },

  meta: {
    label: 'Criar tarefa',
    descricao: 'Cria uma tarefa com título, descrição, cliente, prioridade e prazo. Aceita linguagem natural: "amanhã", "semana que vem", "em 3 dias".',
    categoria: 'Tarefas',
    canais: ['crm', 'whatsapp'],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const titulo     = input.titulo     as string
    const clienteId  = (input.clienteId as string | undefined) ?? ctx.clienteId
    const descricao  = input.descricao  as string | undefined
    const prioridade = (input.prioridade as string | undefined) ?? 'media'
    const prazoInput = input.prazo      as string | undefined

    // Resolve prazo: tenta parse de data ISO ou expressão relativa
    let prazo: Date | undefined
    if (prazoInput) {
      prazo = resolverPrazo(prazoInput)
    }

    const tarefa = await prisma.tarefa.create({
      data: {
        titulo,
        descricao,
        clienteId,
        prioridade: prioridade as never,
        prazo,
        status: 'pendente',
      },
      include: {
        cliente: { select: { nome: true } },
      },
    })

    // Registra interação para rastreabilidade
    if (clienteId) {
      await prisma.interacao.create({
        data: {
          clienteId,
          tipo: 'tarefa_criada',
          titulo: `Tarefa criada pela IA: ${titulo}`,
          metadados: { tarefaId: tarefa.id, prazo: prazo?.toISOString() },
        },
      })
    }

    const prazoStr = tarefa.prazo
      ? ` com prazo em ${tarefa.prazo.toLocaleDateString('pt-BR')}`
      : ''
    const clienteStr = tarefa.cliente ? ` para ${tarefa.cliente.nome}` : ''

    return {
      sucesso: true,
      dados: tarefa,
      resumo: `Tarefa criada${clienteStr}: "${titulo}"${prazoStr}. Prioridade: ${prioridade}.`,
    }
  },
}

/** Converte expressões relativas e datas ISO em objeto Date */
function resolverPrazo(input: string): Date {
  const lower = input.toLowerCase().trim()
  const hoje  = new Date()
  hoje.setHours(9, 0, 0, 0)  // 9h da manhã por default

  if (lower === 'hoje')            return hoje
  if (lower === 'amanhã' || lower === 'amanha') {
    return new Date(hoje.getTime() + 86_400_000)
  }
  if (lower === 'próxima semana' || lower === 'proxima semana') {
    return new Date(hoje.getTime() + 7 * 86_400_000)
  }

  const emDias = lower.match(/em\s+(\d+)\s+dias?/)
  if (emDias) {
    return new Date(hoje.getTime() + parseInt(emDias[1]) * 86_400_000)
  }

  // Tenta parse de data ISO ou legível
  const parsed = new Date(input)
  return isNaN(parsed.getTime()) ? new Date(hoje.getTime() + 86_400_000) : parsed
}

registrarTool(criarTarefaTool)
