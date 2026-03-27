import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const avancarLeadTool: Tool = {
  definition: {
    name: 'avançarLead',
    description:
      'Avança o lead para o próximo passo do funil de onboarding, opcionalmente definindo status, plano, valor negociado, forma de pagamento e dia de vencimento. Use quando o operador disser "avança o lead", "manda pra próxima etapa", "define o plano como X", "valor negociado é R$500", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID do lead a avançar.',
        },
        status: {
          type: 'string',
          enum: [
            'iniciado', 'simulador', 'plano_escolhido', 'dados_preenchidos',
            'socios_preenchidos', 'revisao', 'contrato_gerado',
            'aguardando_assinatura', 'assinado', 'expirado', 'cancelado',
          ],
          description: 'Novo status do lead (opcional — se omitido, apenas incrementa o passo).',
        },
        planoTipo: {
          type: 'string',
          enum: ['essencial', 'profissional', 'empresarial', 'startup'],
          description: 'Plano escolhido (opcional).',
        },
        valorNegociado: {
          type: 'number',
          description: 'Valor mensal negociado em R$ (opcional).',
        },
        vencimentoDia: {
          type: 'number',
          description: 'Dia do mês para vencimento da mensalidade, entre 1 e 31 (opcional).',
        },
        formaPagamento: {
          type: 'string',
          enum: ['pix', 'boleto', 'cartao'],
          description: 'Forma de pagamento (opcional).',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Avançar lead',
    descricao: 'Incrementa o passo do lead no funil e atualiza plano, valor negociado e forma de pagamento.',
    categoria: 'Funil',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const leadId = (input.leadId as string | undefined) ?? ctx.leadId

    if (!leadId) {
      return {
        sucesso: false,
        erro:   'leadId não fornecido.',
        resumo: 'Lead não identificado para avançar.',
      }
    }

    const lead = await prisma.lead.findUnique({
      where:  { id: leadId },
      select: { id: true, stepAtual: true, contatoEntrada: true, dadosJson: true },
    })

    if (!lead) {
      return {
        sucesso: false,
        erro:   `Lead ${leadId} não encontrado.`,
        resumo: 'Lead não encontrado.',
      }
    }

    const updateData: Record<string, unknown> = { stepAtual: lead.stepAtual + 1 }
    if (input.status)         updateData.status         = input.status
    if (input.planoTipo)      updateData.planoTipo      = input.planoTipo
    if (input.valorNegociado) updateData.valorNegociado = input.valorNegociado
    if (input.vencimentoDia)  updateData.vencimentoDia  = input.vencimentoDia
    if (input.formaPagamento) updateData.formaPagamento = input.formaPagamento

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data:  updateData as never,
    })

    const dados    = lead.dadosJson as Record<string, unknown> | null
    const nomeLead = (dados?.nome as string | undefined) ?? lead.contatoEntrada

    const detalhes: string[] = []
    if (input.status)         detalhes.push(`status: ${input.status}`)
    if (input.planoTipo)      detalhes.push(`plano: ${input.planoTipo}`)
    if (input.valorNegociado) detalhes.push(`valor: R$${input.valorNegociado}`)
    if (input.formaPagamento) detalhes.push(`pagamento: ${input.formaPagamento}`)

    return {
      sucesso: true,
      dados:   { leadId, stepAtual: (updated as any).stepAtual, status: (updated as any).status },
      resumo:  `Lead "${nomeLead}" avançado para o passo ${(updated as any).stepAtual}${detalhes.length ? ` (${detalhes.join(', ')})` : ''}.`,
    }
  },
}

registrarTool(avancarLeadTool)
