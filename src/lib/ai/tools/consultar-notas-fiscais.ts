import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const consultarNotasFiscaisTool: Tool = {
  definition: {
    name: 'consultarNotasFiscais',
    description:
      'Consulta notas fiscais de serviço (NFS-e) emitidas para o cliente. ' +
      'Use para responder perguntas como: "qual minha última nota?", "foi emitida NF em janeiro?", ' +
      '"preciso do número da nota", "qual o protocolo da nota de fevereiro?", ' +
      '"quantas notas foram emitidas esse mês?". ' +
      'Para clientes no WhatsApp e Portal: mostre somente notas autorizadas (a menos que perguntem sobre rejeitadas). ' +
      'Para operadores no CRM: mostre todos os status.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente. Use ctx.clienteId se disponível.',
        },
        status: {
          type: 'string',
          enum: ['autorizada', 'rejeitada', 'cancelada', 'processando', 'enviando', 'erro_interno'],
          description: 'Filtrar por status (opcional). Para WhatsApp/Portal use apenas "autorizada".',
        },
        mesAno: {
          type: 'string',
          description: 'Filtrar por mês/ano no formato "2026-01" (opcional).',
        },
        limit: {
          type: 'number',
          description: 'Número máximo de notas a retornar (default: 5, máx: 20).',
        },
      },
      required: ['clienteId'],
    },
  },

  meta: {
    label: 'Consultar notas fiscais',
    descricao: 'Lista NFS-e emitidas para o cliente com status, valores e links.',
    categoria: 'Nota Fiscal',
    canais: ['crm', 'whatsapp', 'portal'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      clienteId: z.string().min(1).optional(),
      status:    z.string().optional(),
      mesAno:    z.string().regex(/^\d{4}-\d{2}$/).optional(),
      limit:     z.number().int().min(1).max(20).optional(),
    }).safeParse(input)

    if (!parsed.success) {
      return { sucesso: false, erro: 'Parâmetros inválidos', resumo: 'Parâmetros inválidos.' }
    }

    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId obrigatório', resumo: 'Cliente não identificado.' }
    }

    const limite = parsed.data.limit ?? 5
    const where: Record<string, unknown> = { clienteId }

    if (parsed.data.status) where.status = parsed.data.status

    if (parsed.data.mesAno) {
      const [ano, mes] = parsed.data.mesAno.split('-').map(Number)
      // Filtra por autorizadaEm — é a data relevante para o cliente ("nota de janeiro")
      where.autorizadaEm = {
        gte: new Date(ano, mes - 1, 1),
        lt:  new Date(ano, mes, 1),
      }
    }

    try {
      const [notas, total] = await Promise.all([
        prisma.notaFiscal.findMany({
          where:   where as never,
          orderBy: { criadoEm: 'desc' },
          take:    limite,
          select: {
            id:           true,
            numero:       true,
            status:       true,
            descricao:    true,
            valorTotal:   true,
            issValor:     true,
            issRetido:    true,
            autorizadaEm: true,
            criadoEm:     true,
            tomadorNome:  true,
            protocolo:    true,
            erroCodigo:   true,
            erroMensagem: true,
            spedyId:      true,
          },
        }),
        prisma.notaFiscal.count({ where: where as never }),
      ])

      if (notas.length === 0) {
        return {
          sucesso: true,
          dados:   { notas: [], total: 0 },
          resumo:  'Nenhuma nota fiscal encontrada para os critérios informados.',
        }
      }

      const STATUS_LABEL: Record<string, string> = {
        autorizada:   '✅ Autorizada',
        rejeitada:    '❌ Rejeitada',
        cancelada:    '🚫 Cancelada',
        processando:  '⏳ Processando',
        enviando:     '📤 Enviando',
        rascunho:     '📝 Rascunho',
        erro_interno: '⚠️ Erro interno',
      }

      const linhas = notas.map(n => {
        const data     = n.autorizadaEm ?? n.criadoEm
        const dataFmt  = format(data, "dd/MM/yyyy", { locale: ptBR })
        const valor    = `R$ ${Number(n.valorTotal).toFixed(2).replace('.', ',')}`
        const numero   = n.numero ? `nº ${n.numero}` : '(sem número)'
        const status   = STATUS_LABEL[n.status] ?? n.status
        const tomador  = n.tomadorNome ? ` | Para: ${n.tomadorNome}` : ''
        const erro     = n.erroMensagem ? ` | Motivo: ${n.erroMensagem.slice(0, 80)}` : ''
        const pdfInfo  = n.spedyId && n.status === 'autorizada' ? ' | PDF disponível no portal' : ''
        return `• NFS-e ${numero} — ${dataFmt} — ${valor} — ${status}${tomador}${erro}${pdfInfo}`
      })

      const resumo = [
        `${total} nota(s) fiscal(is) encontrada(s)${total > limite ? ` (exibindo ${limite} mais recentes)` : ''}:`,
        ...linhas,
      ].join('\n')

      return { sucesso: true, dados: { notas, total }, resumo }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro interno'
      return { sucesso: false, erro: msg, resumo: `Erro ao consultar notas fiscais: ${msg}` }
    }
  },
}

registrarTool(consultarNotasFiscaisTool)
