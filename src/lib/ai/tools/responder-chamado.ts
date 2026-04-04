import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const responderChamadoTool: Tool = {
  definition: {
    name: 'responderChamado',
    description: 'Responde ou atualiza o status de um chamado de um cliente. Use quando o operador pedir para responder um chamado, fechar um ticket, marcar como resolvido ou atualizar o status de atendimento.',
    inputSchema: {
      type: 'object',
      properties: {
        ordemId: {
          type: 'string',
          description: 'ID do chamado a ser respondido/atualizado.',
        },
        numero: {
          type: 'number',
          description: 'Número sequencial do chamado (#42). Alternativa ao ordemId.',
        },
        resposta: {
          type: 'string',
          description: 'Texto da resposta para o cliente. Opcional — pode apenas mudar o status sem resposta.',
        },
        status: {
          type: 'string',
          enum: ['em_andamento', 'aguardando_cliente', 'resolvida', 'cancelada'],
          description: 'Novo status do chamado.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Responder chamado (portal)',
    descricao: 'Responde e/ou atualiza o status de um chamado aberto pelo cliente no portal.',
    categoria: 'Portal',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      ordemId:  z.string().min(1).max(200).optional(),
      numero:   z.number().int().positive().optional(),
      resposta: z.string().min(1).max(5000).optional(),
      status:   z.string().max(50).optional(),
    }).safeParse(input)
    if (!parsed.success) return { sucesso: false, erro: `Parâmetros inválidos: ${parsed.error.issues[0].message}`, resumo: 'Parâmetros inválidos.' }
    const { ordemId, numero, resposta, status } = parsed.data

    if (!ordemId && numero === undefined) {
      return { sucesso: false, erro: 'Informe ordemId ou numero.', resumo: 'Parâmetros insuficientes.' }
    }

    const existing = await prisma.chamado.findFirst({
      where:   ordemId ? { id: ordemId } : { numero },
      include: { cliente: { select: { nome: true } } },
    })

    if (!existing) {
      const ref = numero !== undefined ? `#${numero}` : ordemId
      return { sucesso: false, dados: null, resumo: `Chamado ${ref} não encontrado.` }
    }

    const updateData: any = {}
    if (status)   updateData.status   = status
    if (resposta) {
      updateData.resposta     = resposta
      updateData.respondidoEm = new Date()
      if (ctx.usuarioId) updateData.respondidoPorId = ctx.usuarioId
    }
    if ((status === 'resolvida' || status === 'cancelada') && !existing.fechadoEm) {
      updateData.fechadoEm = new Date()
    }

    const ordem = await prisma.chamado.update({
      where: { id: existing.id },
      data:  updateData,
    })

    const partes: string[] = []
    if (status)   partes.push(`status: ${status}`)
    if (resposta) partes.push('resposta enviada')

    return {
      sucesso: true,
      dados:   ordem,
      resumo:  `Chamado #${existing.numero} "${existing.titulo}" (cliente: ${existing.cliente.nome}) atualizado — ${partes.join(', ')}.`,
    }
  },
}

registrarTool(responderChamadoTool)
