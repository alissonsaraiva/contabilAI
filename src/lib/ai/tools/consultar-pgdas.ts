/**
 * Tool: consultarPGDAS
 * Módulo: Integra-SN (SERPRO)
 *
 * Consulta o PGDAS-D (Programa Gerador do Documento de Arrecadação do Simples Nacional — Declaratório)
 * de um cliente optante pelo Simples Nacional.
 * Requer: integra-sn nos módulos contratados + procuração digital do cliente no e-CAC.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const consultarPGDASTool: Tool = {
  definition: {
    name: 'consultarPGDAS',
    description:
      'Consulta o PGDAS-D de um período de apuração para clientes do Simples Nacional via SERPRO Integra-SN. ' +
      'Retorna situação da declaração, valor devido e data de vencimento. ' +
      'Use quando o operador precisar verificar se o PGDAS foi declarado, qual o valor de uma competência, ' +
      'ou se há débito do Simples Nacional em aberto. ' +
      'O período de apuração deve estar no formato AAAAMM (ex: "202601" para janeiro/2026). ' +
      'Requer que o cliente tenha concedido procuração digital ao escritório via e-CAC.',
    inputSchema: {
      type: 'object',
      properties: {
        cnpj: {
          type: 'string',
          description: 'CNPJ do cliente (com ou sem formatação).',
        },
        periodoApuracao: {
          type: 'string',
          description: 'Período de apuração no formato AAAAMM. Ex: "202601" para janeiro/2026.',
        },
      },
      required: ['cnpj', 'periodoApuracao'],
    },
  },

  meta: {
    label:     'Consultar PGDAS-D (Simples Nacional)',
    descricao: 'Consulta declaração e valor do PGDAS-D de uma competência para clientes do Simples Nacional.',
    categoria: 'Receita Federal (SERPRO)',
    canais:    ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const cnpjRaw         = (input.cnpj            as string | undefined)?.replace(/[.\-/\s]/g, '')
    const periodoApuracao = (input.periodoApuracao  as string | undefined)?.replace(/[^0-9]/g, '')

    if (!cnpjRaw || cnpjRaw.length !== 14) {
      return { sucesso: false, erro: 'CNPJ inválido.', resumo: 'CNPJ inválido.' }
    }
    if (!periodoApuracao || periodoApuracao.length !== 6) {
      return {
        sucesso: false,
        erro:    'Período de apuração inválido. Use o formato AAAAMM (ex: "202601").',
        resumo:  'Período de apuração inválido.',
      }
    }

    try {
      const { consultarPGDAS } = await import('@/lib/services/integra-contador')
      const resultado = await consultarPGDAS(cnpjRaw, periodoApuracao)

      const anoMes = `${periodoApuracao.slice(0, 4)}/${periodoApuracao.slice(4, 6)}`
      const linhas = [
        `CNPJ: ${cnpjRaw}`,
        `Período: ${anoMes}`,
        resultado.status         ? `Situação: ${resultado.status}` : '',
        resultado.valorDevido    != null ? `Valor devido: R$ ${Number(resultado.valorDevido).toFixed(2)}` : '',
        resultado.dataVencimento ? `Vencimento: ${resultado.dataVencimento}` : '',
      ].filter(Boolean).join('\n')

      return { sucesso: true, dados: resultado, resumo: linhas }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-consultar-pgdas', operation: 'execute' },
        extra: { cnpj: cnpjRaw, periodoApuracao },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao consultar PGDAS-D do CNPJ ${cnpjRaw} período ${periodoApuracao}: ${msg}`,
      }
    }
  },
}

registrarTool(consultarPGDASTool)
