import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const publicarComunicadoTool: Tool = {
  definition: {
    name: 'publicarComunicado',
    description: 'Cria e publica um comunicado visível no portal de todos os clientes. Use para informar sobre prazos importantes, obrigações fiscais, avisos de manutenção, alertas de inadimplência coletiva ou qualquer comunicado ao conjunto de clientes.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título do comunicado. Deve ser claro e objetivo, ex: "Prazo IRPF 2025 — 30 de abril".',
        },
        conteudo: {
          type: 'string',
          description: 'Texto completo do comunicado. Pode conter quebras de linha. Seja informativo e objetivo.',
        },
        tipo: {
          type: 'string',
          enum: ['informativo', 'alerta', 'obrigacao', 'promocional'],
          description: 'Tipo do comunicado: informativo (padrão), alerta (urgente), obrigacao (fiscal/legal), promocional.',
        },
        expirarEm: {
          type: 'string',
          description: 'Data de expiração do comunicado em ISO 8601 (ex: 2025-04-30). Após essa data ele para de aparecer no portal.',
        },
        publicar: {
          type: 'boolean',
          description: 'Se true (padrão), publica imediatamente. Se false, salva como rascunho.',
        },
      },
      required: ['titulo', 'conteudo'],
    },
  },

  meta: {
    label: 'Publicar comunicado (portal)',
    descricao: 'Cria e publica um comunicado visível no portal de todos os clientes. Tipos: informativo, alerta, obrigação, promoção.',
    categoria: 'Portal',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      titulo:    z.string().min(1).max(500),
      conteudo:  z.string().min(1).max(50000),
      tipo:      z.string().max(50).optional(),
      expirarEm: z.string().max(50).optional(),
      publicar:  z.boolean().optional(),
    }).safeParse(input)
    if (!parsed.success) return { sucesso: false, erro: `Parâmetros inválidos: ${parsed.error.issues[0].message}`, resumo: 'Parâmetros inválidos.' }
    const titulo    = parsed.data.titulo
    const conteudo  = parsed.data.conteudo
    const tipo      = parsed.data.tipo ?? 'informativo'
    const expirarEm = parsed.data.expirarEm
    const publicar  = parsed.data.publicar !== false  // default true

    const comunicado = await prisma.comunicado.create({
      data: {
        titulo,
        conteudo,
        tipo:         tipo as never,
        publicado:    publicar,
        publicadoEm:  publicar ? new Date() : null,
        expiradoEm:   expirarEm ? new Date(expirarEm) : null,
        criadoPorId:  ctx.usuarioId ?? null,
      },
    })

    const statusStr = publicar ? 'publicado e visível no portal' : 'salvo como rascunho'
    return {
      sucesso: true,
      dados:   comunicado,
      resumo:  `Comunicado "${titulo}" ${statusStr}.${expirarEm ? ` Expira em ${new Date(expirarEm).toLocaleDateString('pt-BR')}.` : ''}`,
    }
  },
}

registrarTool(publicarComunicadoTool)
