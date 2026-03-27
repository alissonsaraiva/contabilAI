import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const resumirFunilTool: Tool = {
  definition: {
    name: 'resumirFunil',
    description: 'Retorna um resumo quantitativo das prospecções e leads por etapa do funil. Use quando o operador perguntar sobre "como estão as prospecções", "quantos leads tenho", "visão geral do funil" ou queira uma visão panorâmica do pipeline.',
    inputSchema: {
      type: 'object',
      properties: {
        funil: {
          type: 'string',
          enum: ['prospeccao', 'onboarding', 'todos'],
          description: 'Qual funil analisar. Use "prospeccao" para o pipeline de vendas, "onboarding" para leads em processo de abertura, "todos" para ambos. Default: "prospeccao".',
        },
        diasAtras: {
          type: 'number',
          description: 'Filtrar apenas leads criados nos últimos N dias. Se omitido, retorna todos.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Resumir funil',
    descricao: 'Visão geral do pipeline: total por etapa, quantos leads entraram hoje e na última semana.',
    categoria: 'Funil',
    canais: ['crm'],
  },
  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const funil  = (input.funil  as string | undefined) ?? 'prospeccao'
    const diasAtras = input.diasAtras as number | undefined

    const whereBase = {
      ...(funil !== 'todos' ? { funil } : {}),
      ...(diasAtras ? { criadoEm: { gte: new Date(Date.now() - diasAtras * 86_400_000) } } : {}),
    }

    const [porEtapa, totalAtivos, criadosHoje, criadosSemana, assinadosSemana, totalCriados] = await Promise.all([
      // Agrupamento por status/etapa
      prisma.lead.groupBy({
        by: ['status'],
        where: { ...whereBase, status: { notIn: ['expirado', 'cancelado'] } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),

      // Total ativo (sem expirado/cancelado)
      prisma.lead.count({
        where: { ...whereBase, status: { notIn: ['expirado', 'cancelado'] } },
      }),

      // Criados hoje
      prisma.lead.count({
        where: {
          ...whereBase,
          criadoEm: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),

      // Criados nos últimos 7 dias
      prisma.lead.count({
        where: {
          ...whereBase,
          criadoEm: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
      }),

      // Convertidos (assinados) nos últimos 30 dias — para taxa de conversão
      prisma.lead.count({
        where: {
          ...whereBase,
          status:    'assinado',
          atualizadoEm: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
      }),

      // Total criado nos últimos 30 dias — denominador da taxa de conversão
      prisma.lead.count({
        where: {
          ...whereBase,
          criadoEm: { gte: new Date(Date.now() - 30 * 86_400_000) },
        },
      }),
    ])

    if (totalAtivos === 0) {
      const funilLabel = funil === 'todos' ? 'nenhum funil' : `funil "${funil}"`
      return {
        sucesso: true,
        dados: { totalAtivos: 0, porEtapa: [], criadosHoje, criadosSemana, taxaConversao30d: 0 },
        resumo: `Nenhum lead ativo encontrado no ${funilLabel}${diasAtras ? ` nos últimos ${diasAtras} dias` : ''}.`,
      }
    }

    // Traduz os status para labels legíveis
    const statusLabel: Record<string, string> = {
      iniciado:              'Novo / Iniciado',
      simulador:             'Simulou planos',
      plano_escolhido:       'Plano escolhido',
      dados_preenchidos:     'Dados preenchidos',
      revisao:               'Em revisão',
      contrato_gerado:       'Contrato gerado',
      aguardando_assinatura: 'Aguardando assinatura',
      assinado:              'Assinado',
    }

    const linhas = porEtapa.map(g =>
      `• ${statusLabel[g.status] ?? g.status}: ${g._count.id} lead${g._count.id > 1 ? 's' : ''}`
    )

    const taxaConversao30d = totalCriados > 0
      ? Math.round((assinadosSemana / totalCriados) * 100)
      : 0

    const funilLabel = funil === 'todos' ? 'todos os funis' : `funil "${funil}"`
    const resumo = [
      `Resumo do ${funilLabel}:`,
      `• Total ativo: ${totalAtivos} lead${totalAtivos > 1 ? 's' : ''}`,
      `• Criados hoje: ${criadosHoje}`,
      `• Criados nos últimos 7 dias: ${criadosSemana}`,
      `• Taxa de conversão (30 dias): ${taxaConversao30d}% — ${assinadosSemana} assinados de ${totalCriados} criados`,
      '',
      'Por etapa:',
      ...linhas,
    ].join('\n')

    return {
      sucesso: true,
      dados: { totalAtivos, porEtapa, criadosHoje, criadosSemana, assinadosSemana, totalCriados30d: totalCriados, taxaConversao30d },
      resumo,
    }
  },
}

registrarTool(resumirFunilTool)
