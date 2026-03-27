import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const listarLeadsInativosTool: Tool = {
  definition: {
    name: 'listarLeadsInativos',
    description: 'Lista leads que estão parados há N dias sem nenhuma interação ou atualização. Útil para identificar oportunidades esquecidas e priorizar follow-up.',
    inputSchema: {
      type: 'object',
      properties: {
        diasSemAtividade: {
          type: 'number',
          description: 'Considerar inativo se não teve atividade há mais de N dias. Default: 7.',
        },
        funil: {
          type: 'string',
          enum: ['prospeccao', 'onboarding', 'todos'],
          description: 'Qual funil verificar. Default: "prospeccao".',
        },
        limite: {
          type: 'number',
          description: 'Máximo de leads a retornar. Default: 10.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Leads inativos',
    descricao: 'Identifica leads parados há X dias sem atividade para retomada proativa.',
    categoria: 'Funil',
    canais: ['crm'],
  },
  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const diasSemAtividade = (input.diasSemAtividade as number | undefined) ?? 7
    const funil  = (input.funil  as string | undefined) ?? 'prospeccao'
    const limite = (input.limite as number | undefined) ?? 10

    const corte = new Date(Date.now() - diasSemAtividade * 86_400_000)

    const leads = await prisma.lead.findMany({
      where: {
        ...(funil !== 'todos' ? { funil } : {}),
        status: { notIn: ['expirado', 'cancelado', 'assinado'] },
        atualizadoEm: { lt: corte },
      },
      select: {
        id: true,
        contatoEntrada: true,
        status: true,
        funil: true,
        canal: true,
        atualizadoEm: true,
        criadoEm: true,
        responsavel: { select: { nome: true } },
        dadosJson: true,
      },
      orderBy: { atualizadoEm: 'asc' },
      take: limite,
    })

    if (leads.length === 0) {
      return {
        sucesso: true,
        dados: [],
        resumo: `Nenhum lead inativo há mais de ${diasSemAtividade} dias no funil "${funil}". Tudo atualizado!`,
      }
    }

    const linhas = leads.map(l => {
      const dados       = l.dadosJson as Record<string, unknown> | null
      const nome        = (dados?.nome as string | undefined) ?? l.contatoEntrada
      const email       = dados?.['E-mail'] as string | undefined
      const telefone    = (dados?.['Telefone'] ?? dados?.['WhatsApp'] ?? dados?.['Celular']) as string | undefined
      const contato     = email ?? telefone ?? l.contatoEntrada
      const diasParado  = Math.floor((Date.now() - l.atualizadoEm.getTime()) / 86_400_000)
      const responsavel = l.responsavel?.nome ? ` · responsável: ${l.responsavel.nome}` : ''
      return `• ${nome} (${contato}) — ${diasParado} dias parado, etapa: ${l.status}${responsavel}`
    })

    const resumo = [
      `${leads.length} lead${leads.length > 1 ? 's' : ''} inativo${leads.length > 1 ? 's' : ''} há mais de ${diasSemAtividade} dias:`,
      ...linhas,
    ].join('\n')

    return {
      sucesso: true,
      dados: leads,
      resumo,
    }
  },
}

registrarTool(listarLeadsInativosTool)
