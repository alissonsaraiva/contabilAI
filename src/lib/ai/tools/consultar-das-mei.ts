/**
 * Tool: consultarDASMEI
 *
 * Consulta as DAS MEI armazenadas no banco para um cliente.
 * Retorna status, valores, vencimentos e histórico de geração.
 * Suporta multi-empresa: busca DAS de TODAS as empresas MEI vinculadas.
 *
 * Nota: diferente de `gerarDASMEI` (que chama o SERPRO para gerar nova DAS),
 * este tool apenas lista o que já foi gerado e está salvo localmente.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import { prisma } from '@/lib/prisma'
import { resolverEmpresasDoCliente } from './resolver-empresa'

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
      'Requer que o cliente tenha pelo menos uma empresa MEI.',
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
    const clienteId   = input.clienteId  as string | undefined
    const competencia = input.competencia as string | undefined

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

      // Busca TODAS as empresas vinculadas e filtra as MEI
      const empresas = await resolverEmpresasDoCliente(clienteId)
      const meis = empresas.filter(e => e.regime === 'MEI')

      if (meis.length === 0) {
        const regimes = empresas.map(e => e.regime).filter(Boolean).join(', ') || 'não informado'
        return {
          sucesso: true,
          dados:   { regime: regimes },
          resumo:  `${clienteRow.nome} não possui empresa MEI (regime(s): ${regimes}). DAS MEI não aplicável.`,
        }
      }

      // Busca DAS de TODAS as empresas MEI
      const dasWhere: any = {
        empresaId: { in: meis.map(e => e.empresaId) },
        ...(competencia && { competencia }),
      }
      const dasMeis = await prisma.dasMEI.findMany({
        where:   dasWhere,
        orderBy: { competencia: 'desc' },
        take:    48,  // 24 per empresa, até 2 MEI
        select: {
          id: true, competencia: true, valor: true, dataVencimento: true,
          codigoBarras: true, urlDas: true, status: true, erroMsg: true,
          criadoEm: true, empresaId: true,
        },
      })

      // Busca status de procuração por empresa
      const empresasComProc = await prisma.empresa.findMany({
        where: { id: { in: meis.map(e => e.empresaId) } },
        select: { id: true, procuracaoRFAtiva: true, cnpj: true, razaoSocial: true, nomeFantasia: true },
      })
      const empMap = new Map(empresasComProc.map(e => [e.id, e]))

      if (dasMeis.length === 0) {
        const procInfo = empresasComProc.map(e =>
          `${e.nomeFantasia ?? e.razaoSocial ?? e.cnpj}: procuração ${e.procuracaoRFAtiva ? 'ativa' : 'não ativa'}`
        ).join('; ')
        return {
          sucesso: true,
          dados:   { dasMeis: [] },
          resumo:  `${clienteRow.nome} — nenhuma DAS MEI gerada ainda. (${procInfo})`,
        }
      }

      const itens = dasMeis.map(d => {
        const comp  = `${d.competencia.slice(4, 6)}/${d.competencia.slice(0, 4)}`
        const valor = d.valor != null ? `R$ ${Number(d.valor).toFixed(2)}` : '—'
        const venc  = d.dataVencimento ? new Date(d.dataVencimento).toLocaleDateString('pt-BR') : '—'
        const status = STATUS_LABEL[d.status] ?? d.status
        const emp = empMap.get(d.empresaId)
        const empLabel = meis.length > 1 ? `[${emp?.nomeFantasia ?? emp?.razaoSocial ?? emp?.cnpj ?? ''}] ` : ''
        const extras = [
          d.codigoBarras ? `Código: ${d.codigoBarras}` : '',
          d.urlDas ? `Link: ${d.urlDas}` : '',
          d.erroMsg ? `Erro: ${d.erroMsg.slice(0, 80)}` : '',
        ].filter(Boolean).join(' | ')
        return `${empLabel}${comp}: ${status} — ${valor} — vence ${venc}${extras ? `\n   ${extras}` : ''}`
      })

      const procLines = empresasComProc.map(e =>
        `${meis.length > 1 ? `[${e.nomeFantasia ?? e.razaoSocial ?? e.cnpj}] ` : ''}Procuração RF: ${e.procuracaoRFAtiva ? 'ativa' : 'não ativa'}`
      )

      const resumo = [
        `DAS MEI — ${clienteRow.nome}`,
        ...procLines,
        '',
        ...itens,
      ].join('\n')

      return {
        sucesso: true,
        dados:   { dasMeis, empresas: empresasComProc },
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
