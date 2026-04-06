/**
 * Tool: consultarDASMEI
 *
 * Consulta as DAS MEI armazenadas no banco para um cliente.
 * Retorna status, valores, vencimentos e histórico de geração.
 *
 * Nota: diferente de `gerarDASMEI` (que chama o SERPRO para gerar nova DAS),
 * este tool apenas lista o que já foi gerado e está salvo localmente.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import { prisma } from '@/lib/prisma'

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente (não paga)',
  paga:     'Paga',
  vencida:  'Vencida',
  erro:     'Erro na geração',
}

const consultarDASMEITool: Tool = {
  definition: {
    name: 'consultarDASMEI',
    description:
      'Consulta as DAS MEI (Documento de Arrecadação do Simples — MEI) armazenadas no sistema para um cliente. ' +
      'Retorna o histórico de DAS geradas com status de pagamento, valor, vencimento, código de barras e link. ' +
      'Use quando o operador quiser saber se a DAS de um mês foi gerada, se foi paga, ou quando um cliente MEI solicitar ' +
      'o código de barras ou link da DAS para pagamento. ' +
      'Para gerar uma nova DAS via SERPRO, use a tool gerarDASMEI. ' +
      'Para enviar a DAS diretamente ao cliente via WhatsApp/email, use enviarDASMEICliente. ' +
      'Requer que o cliente seja MEI.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente no sistema.',
        },
        competencia: {
          type: 'string',
          description: 'Filtrar por competência específica no formato AAAAMM (opcional). Ex: "202601" para jan/2026.',
        },
      },
      required: ['clienteId'],
    },
  },

  meta: {
    label:     'Consultar DAS MEI',
    descricao: 'Lista as DAS MEI geradas e armazenadas para um cliente MEI.',
    categoria: 'Receita Federal (SERPRO)',
    canais:    ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId  = input.clienteId as string | undefined
    const competencia = input.competencia as string | undefined

    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId obrigatório.', resumo: 'clienteId não informado.' }
    }

    try {
      const cliente = await prisma.cliente.findUnique({
        where:  { id: clienteId },
        select: {
          nome:    true,
          empresa: {
            select: {
              regime:           true,
              procuracaoRFAtiva: true,
              dasMeis: {
                where:   competencia ? { competencia } : undefined,
                orderBy: { competencia: 'desc' },
                take:    24,
                select: {
                  id:             true,
                  competencia:    true,
                  valor:          true,
                  dataVencimento: true,
                  codigoBarras:   true,
                  urlDas:         true,
                  status:         true,
                  erroMsg:        true,
                  criadoEm:       true,
                },
              },
            },
          },
        },
      })

      if (!cliente) {
        return { sucesso: false, erro: 'Cliente não encontrado.', resumo: 'Cliente não encontrado.' }
      }

      if (cliente.empresa?.regime !== 'MEI') {
        return {
          sucesso: true,
          dados:   { regime: cliente.empresa?.regime },
          resumo:  `${cliente.nome} não é MEI (regime: ${cliente.empresa?.regime ?? 'não informado'}). DAS MEI não aplicável.`,
        }
      }

      const dasMeis = cliente.empresa.dasMeis ?? []

      if (dasMeis.length === 0) {
        return {
          sucesso: true,
          dados:   { dasMeis: [] },
          resumo:  `${cliente.nome} — nenhuma DAS MEI gerada ainda.${!cliente.empresa.procuracaoRFAtiva ? ' (Procuração RF não ativa — DAS automática desabilitada)' : ''}`,
        }
      }

      const itens = dasMeis.map(d => {
        const comp  = `${d.competencia.slice(4, 6)}/${d.competencia.slice(0, 4)}`
        const valor = d.valor != null ? `R$ ${Number(d.valor).toFixed(2)}` : '—'
        const venc  = d.dataVencimento ? new Date(d.dataVencimento).toLocaleDateString('pt-BR') : '—'
        const status = STATUS_LABEL[d.status] ?? d.status
        const extras = [
          d.codigoBarras ? `Código: ${d.codigoBarras}` : '',
          d.urlDas ? `Link: ${d.urlDas}` : '',
          d.erroMsg ? `Erro: ${d.erroMsg.slice(0, 80)}` : '',
        ].filter(Boolean).join(' | ')
        return `${comp}: ${status} — ${valor} — vence ${venc}${extras ? `\n   ${extras}` : ''}`
      })

      const resumo = [
        `DAS MEI — ${cliente.nome}`,
        `Procuração RF: ${cliente.empresa.procuracaoRFAtiva ? 'ativa' : 'não ativa'}`,
        '',
        ...itens,
      ].join('\n')

      return {
        sucesso: true,
        dados:   { dasMeis, procuracaoRFAtiva: cliente.empresa.procuracaoRFAtiva },
        resumo,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-consultar-das-mei', operation: 'execute' },
        extra: { clienteId },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao consultar DAS MEI: ${msg}`,
      }
    }
  },
}

registrarTool(consultarDASMEITool)
