/**
 * Tool: gerarDASMEI
 * Módulo: Integra-MEI (SERPRO)
 *
 * Gera o DAS (Documento de Arrecadação do Simples) para clientes MEI.
 * Requer: integra-mei nos módulos contratados + procuração digital do cliente no e-CAC.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const gerarDASMEITool: Tool = {
  definition: {
    name: 'gerarDASMEI',
    description:
      'Gera o DAS (Documento de Arrecadação do Simples) para um cliente MEI via SERPRO Integra-MEI. ' +
      'Retorna código de barras, valor e data de vencimento. ' +
      'Use quando o cliente ou operador solicitar o boleto/DAS do MEI de uma competência específica. ' +
      'A competência deve ser no formato AAAAMM (ex: "202601" para janeiro de 2026). ' +
      'Requer que o cliente tenha concedido procuração digital ao escritório via e-CAC.',
    inputSchema: {
      type: 'object',
      properties: {
        cnpj: {
          type: 'string',
          description: 'CNPJ do cliente MEI (com ou sem formatação).',
        },
        competencia: {
          type: 'string',
          description: 'Competência no formato AAAAMM. Ex: "202601" para janeiro/2026.',
        },
      },
      required: ['cnpj', 'competencia'],
    },
  },

  meta: {
    label:     'Gerar DAS MEI',
    descricao: 'Gera o boleto DAS para pagamento mensal de cliente MEI via SERPRO.',
    categoria: 'Receita Federal (SERPRO)',
    canais:    ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const cnpjRaw    = (input.cnpj        as string | undefined)?.replace(/[.\-/\s]/g, '')
    const competencia = (input.competencia as string | undefined)?.replace(/[^0-9]/g, '')

    if (!cnpjRaw || cnpjRaw.length !== 14) {
      return { sucesso: false, erro: 'CNPJ inválido.', resumo: 'CNPJ inválido.' }
    }
    if (!competencia || competencia.length !== 6) {
      return {
        sucesso: false,
        erro:    'Competência inválida. Use o formato AAAAMM (ex: "202601").',
        resumo:  'Competência inválida.',
      }
    }

    try {
      const { gerarDASMEI } = await import('@/lib/services/integra-contador')
      const resultado = await gerarDASMEI(cnpjRaw, competencia)

      const anoMes = `${competencia.slice(0, 4)}/${competencia.slice(4, 6)}`
      const linhas = [
        `CNPJ MEI: ${cnpjRaw}`,
        `Competência: ${anoMes}`,
        resultado.valor         != null ? `Valor: R$ ${Number(resultado.valor).toFixed(2)}` : '',
        resultado.dataVencimento        ? `Vencimento: ${resultado.dataVencimento}` : '',
        resultado.codigoBarras          ? `Código de barras: ${resultado.codigoBarras}` : '',
        resultado.urlDas                ? `Link para pagamento: ${resultado.urlDas}` : '',
      ].filter(Boolean).join('\n')

      return { sucesso: true, dados: resultado, resumo: linhas }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-gerar-das-mei', operation: 'execute' },
        extra: { cnpj: cnpjRaw, competencia },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao gerar DAS MEI para CNPJ ${cnpjRaw} competência ${competencia}: ${msg}`,
      }
    }
  },
}

registrarTool(gerarDASMEITool)
