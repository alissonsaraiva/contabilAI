import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const listarDocumentosPendentesTool: Tool = {
  definition: {
    name: 'listarDocumentosPendentes',
    description: `Lista documentos pendentes — aqueles que estão com status "pendente" ou "solicitado" e ainda não foram recebidos do cliente.

Use quando o operador perguntar:
- "Quais documentos o cliente X ainda não enviou?"
- "Quais clientes têm documentos pendentes?"
- "O que falta receber do João?"
- "Me mostre os documentos aguardando envio"

Pode filtrar por cliente específico, tipo de documento ou período.`,
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente para filtrar. Omita para listar todos os clientes.',
        },
        tipo: {
          type: 'string',
          description: 'Tipo de documento para filtrar. Ex: "Declaração de IR", "Holerite", "Extrato bancário".',
        },
        limite: {
          type: 'number',
          description: 'Máximo de documentos a retornar. Padrão: 20, máximo: 50.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Documentos pendentes',
    descricao: 'Lista documentos que ainda não foram recebidos dos clientes.',
    categoria: 'Documentos',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId = input.clienteId as string | undefined
    const tipo      = input.tipo      as string | undefined
    const limite    = Math.min(Number(input.limite ?? 20), 50)

    // Quando filtrar por cliente específico, inclui documentos da empresa PJ (OR)
    let clienteWhere: object | undefined
    if (clienteId) {
      try {
        const cliente = await prisma.cliente.findUnique({
          where:  { id: clienteId },
          select: { empresaId: true },
        })
        const orConditions: object[] = [{ clienteId }]
        if (cliente?.empresaId) orConditions.push({ empresaId: cliente.empresaId })
        clienteWhere = { OR: orConditions }
      } catch (err) {
        Sentry.captureException(err, {
          tags:  { module: 'listar-documentos-pendentes', operation: 'resolve-empresa' },
          extra: { clienteId },
        })
        clienteWhere = { clienteId }
      }
    }

    const documentos = await prisma.documento.findMany({
      where: {
        status: { in: ['pendente', 'solicitado'] },
        ...clienteWhere,
        tipo:   tipo ? { contains: tipo, mode: 'insensitive' } : undefined,
      },
      select: {
        id:       true,
        nome:     true,
        tipo:     true,
        status:   true,
        origem:   true,
        criadoEm: true,
        cliente: {
          select: { id: true, nome: true, planoTipo: true },
        },
        observacao: true,
      },
      orderBy: { criadoEm: 'asc' },  // mais antigos primeiro — maior urgência
      take: limite,
    })

    if (documentos.length === 0) {
      const msg = clienteId
        ? 'Nenhum documento pendente encontrado para este cliente.'
        : 'Nenhum documento pendente encontrado.'
      return { sucesso: true, dados: { total: 0, documentos: [] }, resumo: msg }
    }

    // Agrupa por cliente para facilitar leitura
    const porCliente = new Map<string, { nomeCliente: string; plano: string | null; docs: typeof documentos }>()
    for (const doc of documentos) {
      const key = doc.cliente?.id ?? 'sem-cliente'
      if (!porCliente.has(key)) {
        porCliente.set(key, {
          nomeCliente: doc.cliente?.nome ?? 'Cliente não vinculado',
          plano:       doc.cliente?.planoTipo ?? null,
          docs:        [],
        })
      }
      porCliente.get(key)!.docs.push(doc)
    }

    const linhasResumo: string[] = []
    for (const { nomeCliente, plano, docs } of porCliente.values()) {
      linhasResumo.push(`${nomeCliente}${plano ? ` (${plano})` : ''}:`)
      for (const d of docs) {
        const diasAberto = Math.floor((Date.now() - d.criadoEm.getTime()) / 86_400_000)
        linhasResumo.push(`  • ${d.nome} (${d.tipo}) — ${diasAberto}d em aberto${d.observacao ? ' — obs: ' + d.observacao : ''}`)
      }
    }

    return {
      sucesso: true,
      dados: {
        total: documentos.length,
        porCliente: Array.from(porCliente.entries()).map(([, v]) => ({
          nomeCliente: v.nomeCliente,
          plano:       v.plano,
          quantidade:  v.docs.length,
          documentos:  v.docs.map(d => ({
            id:        d.id,
            nome:      d.nome,
            tipo:      d.tipo,
            status:    d.status,
            diasAberto: Math.floor((Date.now() - d.criadoEm.getTime()) / 86_400_000),
            observacao: d.observacao,
          })),
        })),
      },
      resumo: `${documentos.length} documento(s) pendente(s) em ${porCliente.size} cliente(s):\n${linhasResumo.join('\n')}`,
    }
  },
}

registrarTool(listarDocumentosPendentesTool)
