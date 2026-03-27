import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const resumoDashboardTool: Tool = {
  definition: {
    name: 'resumoDashboard',
    description:
      'Retorna uma visão executiva do escritório: clientes ativos, MRR, leads do dia, contratos aguardando assinatura e tarefas vencendo. Use quando o operador disser "como está o escritório", "visão geral", "resumo do dia", "quanto é o MRR", "quantos clientes ativos", etc.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  meta: {
    label: 'Resumo do dashboard',
    descricao: 'Visão executiva: clientes ativos, MRR, leads do dia, contratos pendentes e tarefas vencendo.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(_input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const [totalClientes, leadsHoje, aguardandoAssinatura, tarefasVencendo, mrr, leadsAtivos] =
      await Promise.all([
        prisma.cliente.count({ where: { status: 'ativo' } }),
        prisma.lead.count({ where: { criadoEm: { gte: hoje } } }),
        prisma.contrato.count({ where: { status: 'aguardando_assinatura' } }),
        prisma.tarefa.count({
          where: {
            status:  { in: ['pendente', 'em_andamento'] },
            prazo:   { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
          },
        }),
        prisma.cliente.aggregate({
          where:  { status: 'ativo' },
          _sum:   { valorMensal: true },
        }),
        prisma.lead.count({
          where: { status: { notIn: ['cancelado', 'expirado', 'assinado'] } },
        }),
      ])

    const mrrValor = Number(mrr._sum.valorMensal ?? 0)

    const resumo = [
      'Resumo do escritório:',
      `• Clientes ativos: ${totalClientes}`,
      `• MRR: R$${mrrValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `• Leads em andamento: ${leadsAtivos}`,
      `• Leads captados hoje: ${leadsHoje}`,
      `• Contratos aguardando assinatura: ${aguardandoAssinatura}`,
      `• Tarefas vencendo em 24h: ${tarefasVencendo}`,
    ].join('\n')

    return {
      sucesso: true,
      dados: {
        totalClientes,
        mrr:                  mrrValor,
        leadsAtivos,
        leadsHoje,
        aguardandoAssinatura,
        tarefasVencendo,
      },
      resumo,
    }
  },
}

registrarTool(resumoDashboardTool)
