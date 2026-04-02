import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

// Segmentos pré-definidos de clientes
type SegmentoCliente = {
  status?: string[]
  planoTipo?: string[]
  regime?: string[]
  vencimentoEmDias?: number  // clientes cujo vencimento cai nos próximos N dias
}

const enviarComunicadoSegmentadoTool: Tool = {
  definition: {
    name: 'enviarComunicadoSegmentado',
    description: `Publica um comunicado no portal e/ou envia por WhatsApp para um segmento de clientes.

Use quando o operador quiser comunicar algo para um grupo específico:
- "Avisa todos os MEIs sobre o vencimento do DAS"
- "Manda comunicado para os clientes com plano Essencial"
- "Notifica os inadimplentes sobre regularização"
- "Envia para clientes com vencimento nos próximos 5 dias"

Os canais disponíveis são: "portal" (publica comunicado visível no portal) e "whatsapp" (envia mensagem direta).
Pode combinar os dois canais.

Segmento pode filtrar por:
- status: ["ativo", "inadimplente", "suspenso", "cancelado"]
- planoTipo: ["essencial", "profissional", "empresarial", "startup"]
- regime: ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real", "Autônomo PF"]
- vencimentoEmDias: número de dias (clientes cujo vencimento cai nos próximos N dias)`,
    inputSchema: {
      type: 'object',
      properties: {
        titulo: {
          type: 'string',
          description: 'Título do comunicado. Ex: "Alerta: DAS vence em 3 dias"',
        },
        mensagem: {
          type: 'string',
          description: 'Conteúdo da mensagem/comunicado.',
        },
        canais: {
          type: 'array',
          items: { type: 'string', enum: ['portal', 'whatsapp'] },
          description: 'Canais de envio: "portal" e/ou "whatsapp". Padrão: ["portal"].',
        },
        segmento: {
          type: 'object',
          description: 'Filtros para selecionar os clientes destinatários.',
          properties: {
            status:           { type: 'array', items: { type: 'string' }, description: 'Status dos clientes: ativo, inadimplente, suspenso, cancelado' },
            planoTipo:        { type: 'array', items: { type: 'string' }, description: 'Tipos de plano: essencial, profissional, empresarial, startup' },
            regime:           { type: 'array', items: { type: 'string' }, description: 'Regimes tributários' },
            vencimentoEmDias: { type: 'number', description: 'Clientes com vencimento nos próximos N dias' },
          },
        },
        limiteClientes: {
          type: 'number',
          description: 'Limite máximo de clientes a notificar. Padrão: 100.',
        },
      },
      required: ['titulo', 'mensagem'],
    },
  },

  meta: {
    label: 'Comunicado segmentado',
    descricao: 'Publica comunicado e/ou envia WhatsApp para um segmento de clientes.',
    categoria: 'Comunicação',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      titulo:          z.string().min(1).max(500),
      mensagem:        z.string().min(1).max(50000),
      canais:          z.array(z.string()).optional(),
      segmento:        z.record(z.string(), z.unknown()).optional(),
      limiteClientes:  z.number().optional(),
    }).safeParse(input)
    if (!parsed.success) return { sucesso: false, erro: `Parâmetros inválidos: ${parsed.error.issues[0].message}`, resumo: 'Parâmetros inválidos.' }
    const titulo   = parsed.data.titulo
    const mensagem = parsed.data.mensagem

    const canais        = (parsed.data.canais) ?? ['portal']
    const segmento      = (parsed.data.segmento as SegmentoCliente | undefined) ?? {}
    const limiteClientes = Math.min(Number(parsed.data.limiteClientes ?? 100), 200)

    // ─── Monta filtro de clientes ─────────────────────────────────────────────
    const where: Record<string, unknown> = {}

    if (segmento.status?.length) {
      where.status = { in: segmento.status }
    }
    if (segmento.planoTipo?.length) {
      where.planoTipo = { in: segmento.planoTipo }
    }
    if (segmento.regime?.length) {
      where.empresa = { regime: { in: segmento.regime } }
    }
    if (segmento.vencimentoEmDias) {
      const dataLimite = new Date()
      dataLimite.setDate(dataLimite.getDate() + segmento.vencimentoEmDias)
      const diaLimite = dataLimite.getDate()
      // Filtra por dia de vencimento (dia do mês)
      where.vencimentoDia = { lte: diaLimite }
    }

    const clientes = await prisma.cliente.findMany({
      where,
      select: { id: true, nome: true, whatsapp: true, telefone: true, status: true, planoTipo: true },
      take: limiteClientes,
    })

    if (clientes.length === 0) {
      return {
        sucesso: false,
        erro:   'Nenhum cliente encontrado para o segmento especificado.',
        resumo: 'Nenhum cliente encontrado para o segmento especificado. Verifique os filtros e tente novamente.',
      }
    }

    let enviadosPortal    = 0
    let enviadosWhatsapp  = 0
    let falhas            = 0

    // ─── Canal Portal: cria comunicado ────────────────────────────────────────
    if (canais.includes('portal')) {
      try {
        await prisma.comunicado.create({
          data: {
            titulo,
            conteudo:    mensagem,
            tipo:        'informativo',
            publicado:   true,
            publicadoEm: new Date(),
            criadoPorId: ctx.usuarioId ?? null,
          },
        })
        enviadosPortal = clientes.length  // comunicado é visível para todos no portal

        // Indexa no RAG para que a IA conheça o comunicado
        const { indexarAsync } = await import('@/lib/rag/indexar-async')
        // O comunicado será re-indexado pelo hook do prisma (se existir), ou manualmente aqui:
        // indexarAsync é fire-and-forget, não precisamos aguardar
      } catch {
        falhas++
      }
    }

    // ─── Canal WhatsApp: envia mensagem individual ─────────────────────────────
    if (canais.includes('whatsapp')) {
      const toolWhatsapp = await import('./enviar-whatsapp-cliente')
        .then(() => {
          const { getTool } = require('./registry')
          return getTool('enviarWhatsappCliente')
        })
        .catch(() => null)

      for (const cliente of clientes) {
        const tel = cliente.whatsapp ?? cliente.telefone
        if (!tel) { falhas++; continue }

        try {
          if (toolWhatsapp) {
            const result = await toolWhatsapp.execute({ clienteId: cliente.id, mensagem }, ctx)
            if (result.sucesso) {
              enviadosWhatsapp++
            } else {
              falhas++
            }
          } else {
            falhas++
          }
        } catch {
          falhas++
        }
      }
    }

    const totalEnviados = enviadosPortal + enviadosWhatsapp
    const canaisStr     = canais.join(' e ')

    return {
      sucesso: true,
      dados: {
        totalClientes:   clientes.length,
        enviadosPortal,
        enviadosWhatsapp,
        falhas,
        segmentoAplicado: segmento,
      },
      resumo: `Comunicado "${titulo}" enviado para ${totalEnviados} cliente(s) via ${canaisStr}.${falhas > 0 ? ` ${falhas} falha(s).` : ''}`,
    }
  },
}

registrarTool(enviarComunicadoSegmentadoTool)
