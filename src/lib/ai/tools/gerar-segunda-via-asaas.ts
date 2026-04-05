import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import { gerarSegundaVia } from '@/lib/services/asaas-sync'

const gerarSegundaViaAsaasTool: Tool = {
  definition: {
    name: 'gerarSegundaViaAsaas',
    description:
      'Gera uma segunda via da cobrança em aberto de um cliente na Asaas (nova cobrança com vencimento +3 dias a partir de hoje). ' +
      'Use quando: o cliente pedir segunda via, disser que o PIX/boleto expirou, não recebeu o boleto, ou o link não funciona. ' +
      'No WhatsApp/portal usa o clienteId do contexto automaticamente — não peça ao cliente que forneça IDs. ' +
      'No CRM aceita cobrancaId, clienteId ou busca por nome/CPF/CNPJ.',
    inputSchema: {
      type: 'object',
      properties: {
        cobrancaId: {
          type: 'string',
          description: 'ID da CobrancaAsaas (interno). Só disponível no CRM.',
        },
        clienteId: {
          type: 'string',
          description: 'ID do cliente — usa a cobrança em aberto mais antiga. No WhatsApp/portal é preenchido automaticamente pelo contexto.',
        },
        busca: {
          type: 'string',
          description: 'Nome, CPF, CNPJ ou e-mail para busca textual. Apenas no CRM.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Gerar segunda via (Asaas)',
    descricao: 'Gera nova cobrança com vencimento +3 dias na Asaas. Use quando o cliente pedir segunda via, disser que o PIX/boleto expirou ou não tiver recebido a cobrança.',
    categoria: 'Financeiro',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    try {
      let cobrancaId = input.cobrancaId as string | undefined
      const clienteIdInput = (input.clienteId as string | undefined) ?? ctx.clienteId
      const busca          = input.busca as string | undefined

      // No WhatsApp/portal, busca textual é bloqueada para evitar acesso a dados de outros clientes
      const isCanalRestrito = ctx.solicitanteAI === 'whatsapp' || ctx.solicitanteAI === 'portal'

      if (!cobrancaId) {
        let clienteId = clienteIdInput

        if (!clienteId && busca && !isCanalRestrito) {
          const buscaNorm = busca.replace(/[.\-\/\s]/g, '')
          const c = await prisma.cliente.findFirst({
            where: {
              OR: [
                { nome:  { contains: busca, mode: 'insensitive' } },
                { email: { contains: busca, mode: 'insensitive' } },
                { empresa: { is: { razaoSocial: { contains: busca, mode: 'insensitive' } } } },
                { cpf: busca },
                { empresa: { is: { cnpj: busca } } },
                ...(buscaNorm !== busca ? [
                  { cpf: buscaNorm },
                  { empresa: { is: { cnpj: buscaNorm } } },
                ] : []),
              ],
            },
            select: { id: true },
          })
          clienteId = c?.id
        }

        if (!clienteId) {
          const erroMsg = isCanalRestrito
            ? 'Contexto de cliente não disponível. Não é possível gerar segunda via sem identificação.'
            : 'Forneça cobrancaId, clienteId ou busca.'
          return { sucesso: false, erro: erroMsg, resumo: 'Não foi possível identificar a cobrança.' }
        }

        const cobranca = await prisma.cobrancaAsaas.findFirst({
          where:   { clienteId, status: { in: ['PENDING', 'OVERDUE'] } },
          orderBy: { vencimento: 'asc' },
          select:  { id: true },
        })

        if (!cobranca) {
          return {
            sucesso: false,
            erro:    'Nenhuma cobrança em aberto encontrada.',
            resumo:  'Não há cobrança em aberto para este cliente.',
          }
        }
        cobrancaId = cobranca.id
      }

      const nova = await gerarSegundaVia(cobrancaId)

      const linhas = [
        `Segunda via gerada com sucesso! (ID: ${nova.novaCobrancaId})`,
        nova.pixCopiaECola ? `PIX Copia e Cola (exiba ao cliente dentro de bloco de código markdown entre três crases):\n\`\`\`\n${nova.pixCopiaECola}\n\`\`\`` : '',
        nova.linkBoleto    ? `Link do boleto: ${nova.linkBoleto}` : '',
      ].filter(Boolean)

      return {
        sucesso: true,
        dados:   nova,
        resumo:  linhas.join('\n'),
      }
    } catch (err) {
      // BUG 12: sem este bloco, exceções de gerarSegundaVia propagavam sem Sentry
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[tool/gerarSegundaViaAsaas] erro ao gerar segunda via:', err)
      Sentry.captureException(err, {
        tags:  { module: 'tool', operation: 'gerarSegundaViaAsaas' },
        extra: { clienteId: ctx.clienteId, canal: ctx.solicitanteAI },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  'Não foi possível gerar a segunda via. Tente novamente ou acesse o CRM.',
      }
    }
  },
}

registrarTool(gerarSegundaViaAsaasTool)
