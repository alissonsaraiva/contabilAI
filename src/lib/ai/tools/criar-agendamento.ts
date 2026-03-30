import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { proximoDisparo, validarCron, CRON_EXEMPLOS } from '@/lib/ai/cron-helper'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const criarAgendamentoTool: Tool = {
  definition: {
    name: 'criarAgendamento',
    description:
      'Cria um agendamento recorrente para o agente executar uma instrução automaticamente. Use quando o operador disser "toda segunda me manda X", "todo dia às 8h me avisa sobre Y", "todo mês no dia 5 gera Z". O campo cron aceita expressão padrão de 5 campos (minuto hora dia mês diaDaSemana). Exemplos: "0 8 * * 1" = toda segunda 8h, "0 8 * * 1-5" = dias úteis 8h, "0 9 1 * *" = todo dia 1 às 9h.',
    inputSchema: {
      type: 'object',
      properties: {
        descricao: {
          type: 'string',
          description: 'Descrição legível do agendamento, ex: "Relatório semanal de funil toda segunda".',
        },
        cron: {
          type: 'string',
          description: 'Expressão cron de 5 campos. Ex: "0 8 * * 1" para toda segunda às 08:00.',
        },
        instrucao: {
          type: 'string',
          description: 'Instrução em linguagem natural que o agente executará quando disparar. Ex: "resume o funil de prospecção e envia por email para o operador".',
        },
      },
      required: ['descricao', 'cron', 'instrucao'],
    },
  },

  meta: {
    label: 'Criar agendamento',
    descricao: 'Agenda uma instrução recorrente para o agente executar automaticamente (diário, semanal, mensal).',
    categoria: 'Tarefas',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      descricao: z.string().min(1).max(500),
      cron:      z.string().min(1).max(100),
      instrucao: z.string().min(1).max(5000),
    }).safeParse(input)
    if (!parsed.success) return { sucesso: false, erro: `Parâmetros inválidos: ${parsed.error.issues[0].message}`, resumo: 'Parâmetros inválidos.' }
    const { descricao, cron, instrucao } = parsed.data

    if (!validarCron(cron)) {
      const exemplos = Object.entries(CRON_EXEMPLOS)
        .slice(0, 5)
        .map(([desc, expr]) => `  "${expr}" → ${desc}`)
        .join('\n')
      return {
        sucesso: false,
        erro:   `Expressão cron inválida: "${cron}"`,
        resumo: `Expressão cron inválida. Exemplos válidos:\n${exemplos}`,
      }
    }

    const proximo = proximoDisparo(cron)

    const agendamento = await prisma.agendamentoAgente.create({
      data: {
        descricao,
        cron,
        instrucao,
        ativo:          true,
        criadoPorId:    ctx.usuarioId,
        criadoPorNome:  ctx.usuarioNome,
        proximoDisparo: proximo ?? undefined,
      },
    })

    const proximoStr = proximo
      ? proximo.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : 'não calculado'

    return {
      sucesso: true,
      dados:   { agendamentoId: agendamento.id, cron, proximoDisparo: proximo },
      resumo:  `Agendamento criado: "${descricao}". Cron: ${cron}. Próximo disparo: ${proximoStr}. A instrução será executada automaticamente: "${instrucao}"`,
    }
  },
}

registrarTool(criarAgendamentoTool)
