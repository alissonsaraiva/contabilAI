import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const listarPlanosTool: Tool = {
  definition: {
    name: 'listarPlanos',
    description:
      'Lista os planos disponíveis do escritório com preços, serviços inclusos e detalhes. Use quando o operador ou cliente perguntar "quais os planos?", "quanto custa?", "o que inclui o plano profissional?", "lista os valores", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        apenasAtivos: {
          type: 'boolean',
          description: 'Se true, retorna apenas planos ativos. Default: true.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Listar planos',
    descricao: 'Lista os planos do escritório com valores, serviços inclusos e destaques.',
    categoria: 'Clientes',
    canais: ['crm', 'whatsapp', 'portal', 'onboarding'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const apenasAtivos = (input.apenasAtivos as boolean | undefined) ?? true

    const planos = await prisma.plano.findMany({
      where:   apenasAtivos ? { ativo: true } : {},
      orderBy: { valorMinimo: 'asc' },
    })

    if (planos.length === 0) {
      return {
        sucesso: true,
        dados:   [],
        resumo:  'Nenhum plano cadastrado no momento.',
      }
    }

    const linhas = planos.map(p => {
      const faixa    = p.valorMaximo && Number(p.valorMaximo) !== Number(p.valorMinimo)
        ? `R$${Number(p.valorMinimo).toFixed(0)} a R$${Number(p.valorMaximo).toFixed(0)}`
        : `R$${Number(p.valorMinimo).toFixed(0)}`
      const servicos = Array.isArray(p.servicos) && (p.servicos as string[]).length > 0
        ? `\n  Inclui: ${(p.servicos as string[]).join(', ')}`
        : ''
      const destaque = p.destaque ? ' ⭐' : ''
      return `• ${p.nome}${destaque} — ${faixa}/mês${servicos}`
    })

    return {
      sucesso: true,
      dados:   planos,
      resumo:  [`${planos.length} plano${planos.length > 1 ? 's' : ''} disponível${planos.length > 1 ? 'is' : ''}:`, ...linhas].join('\n'),
    }
  },
}

registrarTool(listarPlanosTool)
