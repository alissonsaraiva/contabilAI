/**
 * Tool: emitirCertidaoMEI
 * Módulo: Integra-MEI (SERPRO)
 *
 * Emite a Certidão do MEI (CCMEI — Certificado da Condição de Microempreendedor Individual).
 * Requer: integra-mei nos módulos contratados + procuração digital do cliente no e-CAC.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const emitirCertidaoMEITool: Tool = {
  definition: {
    name: 'emitirCertidaoMEI',
    description:
      'Emite a Certidão do MEI (CCMEI — Certificado da Condição de Microempreendedor Individual) via SERPRO Integra-MEI. ' +
      'Retorna dados cadastrais do MEI, situação e link para download da certidão. ' +
      'Use quando o cliente solicitar a certidão MEI, comprovante de abertura ou precisar comprovar sua condição de MEI. ' +
      'Requer que o cliente tenha concedido procuração digital ao escritório via e-CAC.',
    inputSchema: {
      type: 'object',
      properties: {
        cnpj: {
          type: 'string',
          description: 'CNPJ do cliente MEI (com ou sem formatação).',
        },
      },
      required: ['cnpj'],
    },
  },

  meta: {
    label:     'Emitir Certidão MEI (CCMEI)',
    descricao: 'Emite a certidão de MEI com dados cadastrais e link de download via SERPRO.',
    categoria: 'Receita Federal (SERPRO)',
    canais:    ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const cnpjRaw = (input.cnpj as string | undefined)?.replace(/[.\-/\s]/g, '')
    if (!cnpjRaw || cnpjRaw.length !== 14) {
      return { sucesso: false, erro: 'CNPJ inválido.', resumo: 'CNPJ inválido.' }
    }

    try {
      const { emitirCertidaoMEI } = await import('@/lib/services/integra-contador')
      const resultado = await emitirCertidaoMEI(cnpjRaw)

      const linhas = [
        `CNPJ MEI: ${cnpjRaw}`,
        resultado.nomeEmpresarial  ? `Nome empresarial: ${resultado.nomeEmpresarial}` : '',
        resultado.naturezaJuridica ? `Natureza jurídica: ${resultado.naturezaJuridica}` : '',
        resultado.dataAbertura     ? `Data de abertura: ${resultado.dataAbertura}` : '',
        resultado.situacao         ? `Situação: ${resultado.situacao}` : '',
        resultado.urlCertidao      ? `Certidão disponível em: ${resultado.urlCertidao}` : '',
      ].filter(Boolean).join('\n')

      return { sucesso: true, dados: resultado, resumo: linhas }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-emitir-certidao-mei', operation: 'execute' },
        extra: { cnpj: cnpjRaw },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao emitir certidão MEI para CNPJ ${cnpjRaw}: ${msg}`,
      }
    }
  },
}

registrarTool(emitirCertidaoMEITool)
