import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const STATUS_LABEL: Record<string, string> = {
  rascunho:               'rascunho (não enviado)',
  enviado:                'enviado (aguardando assinatura)',
  aguardando_assinatura:  'aguardando assinatura',
  parcialmente_assinado:  'parcialmente assinado',
  assinado:               'assinado ✓',
  cancelado:              'cancelado',
  expirado:               'expirado',
}

const verificarStatusContratoTool: Tool = {
  definition: {
    name: 'verificarStatusContrato',
    description: 'Verifica o status do contrato: se foi enviado, assinado, pendente ou expirado. No CRM: use quando o operador perguntar sobre o contrato de um lead. No portal: use quando o cliente perguntar "meu contrato foi assinado?", "qual o status do meu contrato?", "onde assino o contrato?". Retorna status, datas e link de assinatura quando disponível.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID do lead (CRM). Opcional quando clienteId está disponível no contexto.',
        },
        clienteId: {
          type: 'string',
          description: 'ID do cliente (portal ou CRM). Usado quando o contrato já está vinculado a um cliente.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Verificar status do contrato',
    descricao: 'Consulta o status do contrato (enviado, assinado, pendente) e retorna o link de assinatura quando disponível.',
    categoria: 'Contratos',
    canais: ['crm', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const leadId    = (input.leadId    as string | undefined) ?? ctx.leadId
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId

    if (!leadId && !clienteId) {
      return {
        sucesso: false,
        erro: 'leadId ou clienteId é obrigatório.',
        resumo: 'Não foi possível verificar o contrato: identificação não fornecida.',
      }
    }

    const contrato = await prisma.contrato.findFirst({
      where: clienteId ? { clienteId } : { leadId: leadId! },
      orderBy: { criadoEm: 'desc' },
      select: {
        id:               true,
        status:           true,
        planoTipo:        true,
        valorMensal:      true,
        vencimentoDia:    true,
        formaPagamento:   true,
        assinadoEm:       true,
        enviadoEm:        true,
        criadoEm:         true,
        clicksignSignUrl: true,
        zapsignSignUrl:   true,
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
        dados:   { leadId, clienteId, contrato: null },
        resumo:  'Nenhum contrato encontrado. O contrato ainda não foi gerado ou enviado.',
      }
    }

    const signUrl = contrato.clicksignSignUrl ?? contrato.zapsignSignUrl ?? null
    const pendente = ['enviado', 'aguardando_assinatura', 'parcialmente_assinado'].includes(contrato.status)

    // No portal, não expõe dados do lead (nome via dadosJson)
    const isPortal = ctx.solicitanteAI === 'portal'
    const dados    = (contrato.lead?.dadosJson ?? {}) as Record<string, string>
    const nome     = isPortal ? null : (dados['Nome completo'] ?? dados['Razão Social'] ?? contrato.lead?.contatoEntrada ?? leadId)

    const linhas = [
      nome ? `Contrato de ${nome}` : 'Contrato',
      `Status: ${STATUS_LABEL[contrato.status] ?? contrato.status}`,
      `Plano: ${contrato.planoTipo}`,
      contrato.valorMensal    ? `Valor: R$ ${contrato.valorMensal}/mês` : '',
      contrato.vencimentoDia  ? `Vencimento: dia ${contrato.vencimentoDia}` : '',
      contrato.formaPagamento ? `Pagamento: ${contrato.formaPagamento}` : '',
      `Gerado em: ${contrato.criadoEm.toLocaleDateString('pt-BR')}`,
      contrato.enviadoEm  ? `Enviado em: ${contrato.enviadoEm.toLocaleDateString('pt-BR')}` : '',
      contrato.assinadoEm ? `Assinado em: ${contrato.assinadoEm.toLocaleDateString('pt-BR')}` : '',
      pendente && signUrl ? `Link para assinar: ${signUrl}` : '',
    ].filter(Boolean).join('\n')

    return {
      sucesso: true,
      dados: {
        leadId:         leadId ?? null,
        clienteId:      clienteId ?? null,
        status:         contrato.status,
        planoTipo:      contrato.planoTipo,
        valorMensal:    contrato.valorMensal,
        vencimentoDia:  contrato.vencimentoDia,
        formaPagamento: contrato.formaPagamento,
        assinadoEm:     contrato.assinadoEm?.toISOString() ?? null,
        enviadoEm:      contrato.enviadoEm?.toISOString()  ?? null,
        criadoEm:       contrato.criadoEm.toISOString(),
        signUrl,
      },
      resumo: linhas,
    }
  },
}

registrarTool(verificarStatusContratoTool)
