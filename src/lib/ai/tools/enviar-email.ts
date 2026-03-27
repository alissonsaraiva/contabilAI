import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { wrapEmailHtml } from '@/lib/email/template'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

// Deduplicação: evita reenvio acidental do mesmo e-mail para o mesmo destinatário em 90s
const _enviados = new Map<string, number>()
function jáEnviado(para: string, assunto: string): boolean {
  const chave = `${para}::${assunto}`
  const ultimo = _enviados.get(chave)
  if (ultimo && Date.now() - ultimo < 90_000) return true
  _enviados.set(chave, Date.now())
  // Limpa entradas expiradas
  for (const [k, ts] of _enviados) {
    if (Date.now() - ts > 90_000) _enviados.delete(k)
  }
  return false
}

const enviarEmailTool: Tool = {
  definition: {
    name: 'enviarEmail',
    description:
      'Envia um e-mail para um cliente ou lead e registra como interação. Use quando o operador disser "manda um email", "envia um email para o cliente sobre X", "manda uma mensagem de email", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        para: {
          type: 'string',
          description: 'Endereço de e-mail do destinatário.',
        },
        assunto: {
          type: 'string',
          description: 'Assunto do e-mail.',
        },
        corpo: {
          type: 'string',
          description: 'Corpo do e-mail (texto simples ou HTML).',
        },
        clienteId: {
          type: 'string',
          description: 'ID do cliente para vincular no histórico (opcional).',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead para vincular no histórico (opcional).',
        },
      },
      required: ['para', 'assunto', 'corpo'],
    },
  },

  meta: {
    label: 'Enviar e-mail',
    descricao: 'Envia e-mail para cliente ou lead via SMTP/Resend e registra automaticamente como interação.',
    categoria: 'Clientes',
    canais: ['crm', 'whatsapp'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const para      = input.para    as string
    const assunto   = input.assunto as string
    const corpo     = input.corpo   as string
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId
    const leadId    = (input.leadId    as string | undefined) ?? ctx.leadId

    // Evita duplicatas (ex: boas-vindas automática + e-mail manual com mesmo assunto)
    if (jáEnviado(para, assunto)) {
      return {
        sucesso: true,
        dados:   { deduplicado: true },
        resumo:  `E-mail para ${para} com assunto "${assunto}" já foi enviado nos últimos 90 segundos — ignorado para evitar duplicata.`,
      }
    }

    // Busca nome do escritório para o template (fire-and-forget se falhar)
    const escritorio = await prisma.escritorio.findFirst({ select: { nome: true } }).catch(() => null)
    const corpoHtml  = wrapEmailHtml(corpo, { nomeEscritorio: escritorio?.nome ?? 'ContabAI', assunto })

    const resultado = await sendEmail({ para, assunto, corpo: corpoHtml })

    if (!resultado.ok) {
      return {
        sucesso: false,
        erro: resultado.erro,
        resumo: `Falha ao enviar e-mail para ${para}: ${resultado.erro}`,
      }
    }

    await prisma.interacao.create({
      data: {
        clienteId: clienteId ?? undefined,
        leadId:    leadId    ?? undefined,
        tipo:      'email_enviado',
        titulo:    assunto,
        conteudo:  corpo,
        metadados: {
          para,
          messageId:       resultado.messageId,
          registradoPorAI: true,
          solicitante:     ctx.solicitanteAI,
        },
      } as never,
    })

    // Indexa no RAG (fire-and-forget)
    if (clienteId || leadId) {
      import('@/lib/rag/ingest').then(({ indexarInteracao }) =>
        indexarInteracao({
          id:        resultado.messageId ?? 'email',
          clienteId: clienteId ?? undefined,
          leadId:    leadId    ?? undefined,
          tipo:      'email_enviado',
          titulo:    assunto,
          conteudo:  corpo,
          criadoEm:  new Date(),
        })
      ).catch(() => {})
    }

    return {
      sucesso: true,
      dados:   { messageId: resultado.messageId },
      resumo:  `E-mail enviado para ${para} com assunto "${assunto}".`,
    }
  },
}

registrarTool(enviarEmailTool)
