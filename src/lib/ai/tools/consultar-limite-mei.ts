/**
 * Tool: consultarLimiteMEI
 *
 * Consulta o faturamento acumulado de um cliente MEI no ano corrente
 * com base nas NFS-e autorizadas emitidas pelo sistema.
 *
 * Retorna percentual do limite, zona (verde/amarelo/vermelho),
 * valor acumulado e restante.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import { prisma } from '@/lib/prisma'
import { calcularLimiteMEI } from '@/lib/services/limite-mei'
import { resolverEmpresasDoCliente } from './resolver-empresa'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const consultarLimiteMEITool: Tool = {
  definition: {
    name: 'consultarLimiteMEI',
    description:
      'Consulta o faturamento acumulado de um cliente MEI no ano atual com base nas NFS-e autorizadas emitidas pelo sistema. ' +
      'Retorna o valor acumulado, o limite anual (R$ 81.000), o percentual utilizado, a zona de alerta ' +
      '(verde <75%, amarelo 75-90%, vermelho >=90%) e o valor restante para o teto. ' +
      'Use quando o operador quiser saber se um MEI está próximo do limite de faturamento anual. ' +
      'Atenção: considera apenas notas autorizadas emitidas neste sistema — receitas sem NF não são computadas. ' +
      'Requer que o cliente seja MEI e tenha empresa vinculada.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente no sistema.',
        },
        ano: {
          type: 'number',
          description: 'Ano fiscal a consultar (opcional — padrão: ano corrente).',
        },
      },
      required: ['clienteId'],
    },
  },

  meta: {
    label:     'Consultar Limite MEI',
    descricao: 'Verifica o percentual do limite anual MEI utilizado via NFS-e.',
    categoria: 'Financeiro / MEI',
    canais:    ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = input.clienteId as string | undefined
    const ano       = input.ano as number | undefined

    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId obrigatório.', resumo: 'clienteId não informado.' }
    }

    try {
      const clienteRow = await prisma.cliente.findUnique({
        where:  { id: clienteId },
        select: { nome: true },
      })

      if (!clienteRow) {
        return { sucesso: false, erro: 'Cliente não encontrado.', resumo: 'Cliente não encontrado.' }
      }

      // Busca todas as empresas e filtra as MEI
      const empresas = await resolverEmpresasDoCliente(clienteId)
      const meis = empresas.filter(e => e.regime === 'MEI')

      if (meis.length === 0) {
        const regimes = empresas.map(e => e.regime).filter(Boolean).join(', ') || 'não informado'
        return {
          sucesso: true,
          dados:   { regime: regimes },
          resumo:  `${clienteRow.nome} não possui empresa MEI (regime(s): ${regimes}). Limite MEI não aplicável.`,
        }
      }

      // Se múltiplos MEI, usa o primeiro (raro, mas possível)
      const empresa = meis[0]!
      const resultado = await calcularLimiteMEI(empresa.empresaId, ano)

      const zonaLabel: Record<string, string> = {
        verde:    '🟢 Verde (dentro do limite)',
        amarelo:  '🟡 Amarelo (atenção — próximo do limite)',
        vermelho: '🔴 Vermelho (crítico — limite iminente)',
      }

      const porMesTexto = resultado.porMes.length > 0
        ? resultado.porMes.map(({ mes, total }) =>
            `  ${MESES[mes - 1]}: R$ ${total.toFixed(2)}`
          ).join('\n')
        : '  Nenhuma NFS-e autorizada no período.'

      const resumo = [
        `Limite MEI — ${clienteRow.nome} (${resultado.ano})`,
        ``,
        `Faturado:   R$ ${resultado.acumulado.toFixed(2)}`,
        `Limite:     R$ ${resultado.limite.toFixed(2)}`,
        `Percentual: ${resultado.percentual.toFixed(1)}%`,
        `Restante:   R$ ${resultado.restante.toFixed(2)}`,
        `Zona:       ${zonaLabel[resultado.zona]}`,
        ``,
        `Faturamento por mês (NFS-e autorizadas):`,
        porMesTexto,
        ``,
        `⚠️ Receitas sem NF não são computadas automaticamente.`,
      ].join('\n')

      return { sucesso: true, dados: resultado, resumo }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-consultar-limite-mei', operation: 'execute' },
        extra: { clienteId, ano },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao consultar limite MEI: ${msg}`,
      }
    }
  },
}

registrarTool(consultarLimiteMEITool)
