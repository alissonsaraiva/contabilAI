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
    const titulo    = input.titulo    as string
    const conteudo  = input.conteudo  as string
    const tipo      = (input.tipo      as string | undefined) ?? 'informativo'
    const expirarEm = input.expirarEm as string | undefined
    const publicar  = input.publicar  !== false  // default true

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
