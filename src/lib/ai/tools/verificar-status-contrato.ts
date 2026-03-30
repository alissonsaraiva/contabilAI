import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const verificarStatusContratoTool: Tool = {
  definition: {
    name: 'verificarStatusContrato',
    description: 'Verifica o status do contrato de um lead: se foi enviado, visualizado, assinado, recusado ou pendente. Use quando o operador perguntar "o lead assinou?", "qual status do contrato?", "o contrato foi enviado?". Retorna data de envio, assinatura, plano contratado e forma de pagamento.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID do lead para verificar o contrato.',
        },
      },
      required: ['leadId'],
    },
  },

  meta: {
    label: 'Verificar status do contrato',
    descricao: 'Consulta o status do contrato de um lead (enviado, assinado, pendente, recusado).',
    categoria: 'Contratos',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const leadId = (input.leadId as string | undefined) ?? ctx.leadId

    if (!leadId) {
      return {
        sucesso: false,
        erro: 'leadId é obrigatório.',
        resumo: 'Não foi possível verificar o contrato: lead não identificado.',
      }
    }

    const contrato = await prisma.contrato.findFirst({
      where:   { leadId },
      orderBy: { criadoEm: 'desc' },
      select: {
        id:             true,
        status:         true,
        planoTipo:      true,
        valorMensal:    true,
        vencimentoDia:  true,
        formaPagamento: true,
        assinadoEm:     true,
        enviadoEm:      true,
        criadoEm:       true,
        lead: {
          select: {
            contatoEntrada: true,
            dadosJson:      true,
          },
        },
      },
    }).catch(() => null)

    if (!contrato) {
      return {
        sucesso: true,
        dados:   { leadId, contrato: null },
        resumo:  `Nenhum contrato encontrado para este lead. O contrato ainda não foi gerado ou enviado.`,
      }
    }

    const dados   = (contrato.lead?.dadosJson ?? {}) as Record<string, string>
    const nome    = dados['Nome completo'] ?? dados['Razão Social'] ?? contrato.lead?.contatoEntrada ?? leadId

    const statusLabel: Record<string, string> = {
      rascunho:               'rascunho (não enviado)',
      enviado:                'enviado (aguardando assinatura)',
      aguardando_assinatura:  'aguardando assinatura',
      parcialmente_assinado:  'parcialmente assinado',
      assinado:               'assinado ✓',
      cancelado:              'cancelado',
      expirado:               'expirado',
    }

    const linhas = [
      `Contrato de ${nome}`,
      `Status: ${statusLabel[contrato.status] ?? contrato.status}`,
      `Plano: ${contrato.planoTipo}`,
      contrato.valorMensal    ? `Valor: R$ ${contrato.valorMensal}/mês` : '',
      contrato.vencimentoDia  ? `Vencimento: dia ${contrato.vencimentoDia}` : '',
      contrato.formaPagamento ? `Pagamento: ${contrato.formaPagamento}` : '',
      `Gerado em: ${contrato.criadoEm.toLocaleDateString('pt-BR')}`,
      contrato.assinadoEm     ? `Assinado em: ${contrato.assinadoEm.toLocaleDateString('pt-BR')}` : '',
    ].filter(Boolean).join('\n')

    return {
      sucesso: true,
      dados: {
        leadId,
        status:         contrato.status,
        planoTipo:      contrato.planoTipo,
        valorMensal:    contrato.valorMensal,
        vencimentoDia:  contrato.vencimentoDia,
        formaPagamento: contrato.formaPagamento,
        assinadoEm:     contrato.assinadoEm?.toISOString() ?? null,
        enviadoEm:      contrato.enviadoEm?.toISOString() ?? null,
        criadoEm:       contrato.criadoEm.toISOString(),
      },
      resumo: linhas,
    }
  },
}

registrarTool(verificarStatusContratoTool)
