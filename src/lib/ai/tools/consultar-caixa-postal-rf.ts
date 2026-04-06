/**
 * Tool: consultarCaixaPostalRF
 * Módulo: Integra-CaixaPostal (SERPRO)
 *
 * Consulta as mensagens da Caixa Postal da Receita Federal de um cliente.
 * Requer: integra-caixapostal nos módulos contratados + procuração digital do cliente no e-CAC.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const consultarCaixaPostalRFTool: Tool = {
  definition: {
    name: 'consultarCaixaPostalRF',
    description:
      'Consulta as mensagens da Caixa Postal da Receita Federal de um cliente via SERPRO Integra-CaixaPostal. ' +
      'Retorna lista de mensagens com assunto, data e status de leitura. ' +
      'Use quando o operador precisar verificar se a Receita Federal enviou alguma notificação, intimação ou comunicado ' +
      'para o cliente, ou para checar se há DTE (Domicílio Tributário Eletrônico) não lidos. ' +
      'Requer que o cliente tenha concedido procuração digital ao escritório via e-CAC.',
    inputSchema: {
      type: 'object',
      properties: {
        cnpj: {
          type: 'string',
          description: 'CNPJ do cliente (com ou sem formatação).',
        },
      },
      required: ['cnpj'],
    },
  },

  meta: {
    label:     'Consultar Caixa Postal RF',
    descricao: 'Consulta notificações e mensagens da Receita Federal na caixa postal do cliente.',
    categoria: 'Receita Federal (SERPRO)',
    canais:    ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const cnpjRaw = (input.cnpj as string | undefined)?.replace(/[.\-/\s]/g, '')
    if (!cnpjRaw || cnpjRaw.length !== 14) {
      return { sucesso: false, erro: 'CNPJ inválido.', resumo: 'CNPJ inválido.' }
    }

    try {
      const { consultarCaixaPostalRF } = await import('@/lib/services/integra-contador')
      const resultado = await consultarCaixaPostalRF(cnpjRaw)

      if (resultado.mensagens.length === 0) {
        return {
          sucesso: true,
          dados:   resultado,
          resumo:  `Caixa Postal RF do CNPJ ${cnpjRaw}: nenhuma mensagem encontrada.`,
        }
      }

      const itens = resultado.mensagens.map((m, i) =>
        `${i + 1}. [${m.lida ? 'Lida' : 'Não lida'}] ${m.assunto ?? 'Sem assunto'} — ${m.datahora ?? 'data não informada'}${m.tipo ? ` (${m.tipo})` : ''}`,
      )

      const resumo = [
        `Caixa Postal RF — CNPJ ${cnpjRaw}`,
        `Total de mensagens: ${resultado.total}`,
        '',
        ...itens,
      ].join('\n')

      return { sucesso: true, dados: resultado, resumo }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-consultar-caixa-postal-rf', operation: 'execute' },
        extra: { cnpj: cnpjRaw },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao consultar Caixa Postal RF do CNPJ ${cnpjRaw}: ${msg}`,
      }
    }
  },
}

registrarTool(consultarCaixaPostalRFTool)
