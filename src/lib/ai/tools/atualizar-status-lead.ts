import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

// Mapeamento de etapas legíveis → enum do banco
const ETAPA_MAP: Record<string, string> = {
  // Prospecção (funil comercial)
  'novo':              'iniciado',
  'em contato':        'iniciado',
  'qualificado':       'plano_escolhido',
  'proposta enviada':  'contrato_gerado',
  // Onboarding
  'iniciado':          'iniciado',
  'simulou':           'simulador',
  'plano escolhido':   'plano_escolhido',
  'dados preenchidos': 'dados_preenchidos',
  'socios preenchidos':'socios_preenchidos',
  'revisao':           'revisao',
  'em revisão':        'revisao',
  'contrato gerado':   'contrato_gerado',
  'aguardando assinatura': 'aguardando_assinatura',
  'assinado':          'assinado',
  'cancelado':         'cancelado',
}

const atualizarStatusLeadTool: Tool = {
  definition: {
    name: 'atualizarStatusLead',
    description: 'Atualiza o status/etapa de um lead no funil (prospecção ou onboarding). Use quando o operador pedir "mover o lead para X", "atualizar etapa do lead", "marcar como qualificado", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID do lead a atualizar.',
        },
        novoStatus: {
          type: 'string',
          description: 'Nova etapa do lead. Pode ser o valor do enum (ex: "plano_escolhido") ou uma descrição legível (ex: "qualificado", "proposta enviada", "assinado").',
        },
        observacao: {
          type: 'string',
          description: 'Motivo ou observação sobre a mudança de status (opcional, registrado como interação).',
        },
      },
      required: ['leadId', 'novoStatus'],
    },
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const leadId     = (input.leadId     as string | undefined) ?? ctx.leadId
    const novoStatus = input.novoStatus  as string
    const observacao = input.observacao  as string | undefined

    if (!leadId) {
      return {
        sucesso: false,
        erro: 'leadId não fornecido.',
        resumo: 'Não foi possível atualizar o status: lead não identificado.',
      }
    }

    // Resolve status legível para enum do banco
    const statusNormalizado = novoStatus.toLowerCase().trim()
    const statusEnum = ETAPA_MAP[statusNormalizado] ?? novoStatus

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, status: true, contatoEntrada: true, dadosJson: true },
    })

    if (!lead) {
      return {
        sucesso: false,
        erro: `Lead ${leadId} não encontrado.`,
        resumo: 'Lead não encontrado.',
      }
    }

    const statusAnterior = lead.status

    await prisma.lead.update({
      where: { id: leadId },
      data:  { status: statusEnum as never },
    })

    // Registra a mudança como interação
    await prisma.interacao.create({
      data: {
        leadId,
        tipo: 'status_mudou',
        titulo: `Status alterado: ${statusAnterior} → ${statusEnum}`,
        conteudo: observacao,
        metadados: {
          statusAnterior,
          statusNovo: statusEnum,
          alteradoPorAI: true,
          solicitante: ctx.solicitanteAI,
        },
      },
    })

    const dados = lead.dadosJson as Record<string, unknown> | null
    const nomeLead = (dados?.nome as string | undefined) ?? lead.contatoEntrada

    return {
      sucesso: true,
      dados: { leadId, statusAnterior, statusNovo: statusEnum },
      resumo: `Status do lead "${nomeLead}" atualizado: ${statusAnterior} → ${statusEnum}.${observacao ? ` Observação: ${observacao}` : ''}`,
    }
  },
}

registrarTool(atualizarStatusLeadTool)
