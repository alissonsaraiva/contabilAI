/**
 * Tool: consultarSituacaoFiscal
 * Módulo: Integra-Sitfis (SERPRO)
 *
 * Consulta a situação fiscal de um cliente junto à Receita Federal.
 * Requer: integra-sitfis nos módulos contratados + procuração digital do cliente no e-CAC.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const consultarSituacaoFiscalTool: Tool = {
  definition: {
    name: 'consultarSituacaoFiscal',
    description:
      'Consulta a situação fiscal de um cliente junto à Receita Federal via SERPRO Integra-Sitfis. ' +
      'Retorna pendências, regularidade e data da consulta. ' +
      'Use quando o operador perguntar se um cliente está em dia com a Receita Federal, se há débitos ou pendências fiscais, ' +
      'ou antes de realizar operações que exigem regularidade fiscal (abertura de conta, financiamento, etc.). ' +
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
    label:     'Consultar situação fiscal (RF)',
    descricao: 'Consulta pendências e regularidade fiscal de um cliente junto à Receita Federal via SERPRO.',
    categoria: 'Receita Federal (SERPRO)',
    canais:    ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const cnpjRaw = (input.cnpj as string | undefined)?.replace(/[.\-/\s]/g, '')
    if (!cnpjRaw || cnpjRaw.length !== 14) {
      return { sucesso: false, erro: 'CNPJ inválido. Forneça 14 dígitos.', resumo: 'CNPJ inválido.' }
    }

    try {
      const { consultarSituacaoFiscal } = await import('@/lib/services/integra-contador')
      const resultado = await consultarSituacaoFiscal(cnpjRaw)

      const pendenciasTexto = resultado.pendencias.length > 0
        ? resultado.pendencias.map((p: any) =>
            `• ${p.tipo ?? 'Pendência'}: ${p.descricao ?? ''}${p.valor != null ? ` (R$ ${Number(p.valor).toFixed(2)})` : ''}`
          ).join('\n')
        : '• Nenhuma pendência encontrada'

      const resumo = [
        `CNPJ: ${cnpjRaw}`,
        `Situação: ${resultado.situacao ?? 'não informada'}`,
        `Data da consulta: ${resultado.dataConsulta ?? 'não informada'}`,
        `\nPendências fiscais:`,
        pendenciasTexto,
      ].join('\n')

      return { sucesso: true, dados: resultado, resumo }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-consultar-situacao-fiscal', operation: 'execute' },
        extra: { cnpj: cnpjRaw },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao consultar situação fiscal do CNPJ ${cnpjRaw}: ${msg}`,
      }
    }
  },
}

registrarTool(consultarSituacaoFiscalTool)
