import { registrarInteracao } from '@/lib/services/interacoes'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const registrarInteracaoTool: Tool = {
  definition: {
    name: 'registrarInteracao',
    description: 'Registra uma interação no histórico de um cliente ou lead (ligação realizada, email enviado, reunião, nota interna, etc.). Use quando o operador disser "registra que liguei", "anota que enviamos email", "adiciona uma observação", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['ligacao', 'email_enviado', 'email_recebido', 'nota_interna', 'whatsapp_enviado'],
          description: 'Tipo da interação.',
        },
        titulo: {
          type: 'string',
          description: 'Título ou assunto da interação. Ex: "Ligação de follow-up sobre DAS".',
        },
        conteudo: {
          type: 'string',
          description: 'Detalhes adicionais, observações ou resumo da interação (opcional).',
        },
        clienteId: {
          type: 'string',
          description: 'ID do cliente. Usar quando for um cliente (não lead).',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead. Usar quando for um lead em prospecção/onboarding.',
        },
        dataOcorrencia: {
          type: 'string',
          description: 'Data e hora em que a interação ocorreu, no formato ISO 8601 (ex: "2025-03-20T14:30:00"). Use quando o operador estiver registrando uma interação passada, como "registra que eu liguei ontem às 14h". Se omitido, usa a data/hora atual.',
        },
      },
      required: ['tipo', 'titulo'],
    },
  },

  meta: {
    label: 'Registrar interação',
    descricao: 'Loga ligação, e-mail, nota interna ou mensagem WhatsApp como interação do cliente ou lead.',
    categoria: 'Histórico',
    canais: ['crm', 'whatsapp', 'portal'],
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const tipo           = input.tipo           as string
    const titulo         = input.titulo         as string
    const conteudo       = input.conteudo       as string | undefined
    const clienteId      = (input.clienteId as string | undefined) ?? ctx.clienteId
    const leadId         = (input.leadId    as string | undefined) ?? ctx.leadId
    const dataOcorrencia = input.dataOcorrencia as string | undefined

    if (!clienteId && !leadId) {
      return {
        sucesso: false,
        erro: 'Forneça clienteId ou leadId para registrar a interação.',
        resumo: 'Não foi possível registrar a interação: cliente/lead não identificado.',
      }
    }

    const criadoEm = dataOcorrencia ? new Date(dataOcorrencia) : undefined

    const interacaoId = await registrarInteracao({
      clienteId,
      leadId,
      tipo:     tipo as never,
      titulo,
      conteudo,
      origem:   'usuario',
      ...(criadoEm && !isNaN(criadoEm.getTime()) ? { criadoEm } : {}),
      metadados: {
        registradoPorAI: true,
        solicitante: ctx.solicitanteAI,
        ...(dataOcorrencia ? { dataOcorrenciaOriginal: dataOcorrencia } : {}),
      },
    })

    const tipoLabel: Record<string, string> = {
      ligacao:          'Ligação',
      email_enviado:    'Email enviado',
      email_recebido:   'Email recebido',
      nota_interna:     'Nota interna',
      whatsapp_enviado: 'Mensagem WhatsApp',
    }

    const dataDisplay = criadoEm && !isNaN(criadoEm.getTime())
      ? ` (data: ${criadoEm.toLocaleDateString('pt-BR')})`
      : ''

    return {
      sucesso: true,
      dados: { id: interacaoId },
      resumo: `Interação registrada: ${tipoLabel[tipo] ?? tipo} — "${titulo}"${dataDisplay}.`,
    }
  },
}

registrarTool(registrarInteracaoTool)
