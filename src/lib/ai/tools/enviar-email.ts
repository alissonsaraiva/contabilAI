import { z } from 'zod'
import { enviarEmailComHistorico } from '@/lib/email/com-historico'
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
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      para:      z.string().email().max(320),
      assunto:   z.string().min(1).max(500),
      corpo:     z.string().min(1).max(50000),
      clienteId: z.string().min(1).max(200).optional(),
      leadId:    z.string().min(1).max(200).optional(),
    }).safeParse(input)
    if (!parsed.success) return { sucesso: false, erro: `Parâmetros inválidos: ${parsed.error.issues[0].message}`, resumo: 'Parâmetros inválidos.' }
    const para      = parsed.data.para
    const assunto   = parsed.data.assunto
    const corpo     = parsed.data.corpo
    const clienteId = parsed.data.clienteId ?? ctx.clienteId
    const leadId    = parsed.data.leadId    ?? ctx.leadId

    // Evita duplicatas (ex: boas-vindas automática + e-mail manual com mesmo assunto)
    if (jáEnviado(para, assunto)) {
      return {
        sucesso: true,
        dados:   { deduplicado: true },
        resumo:  `E-mail para ${para} com assunto "${assunto}" já foi enviado nos últimos 90 segundos — ignorado para evitar duplicata.`,
      }
    }

    const resultado = await enviarEmailComHistorico({
      para,
      assunto,
      corpo,
      clienteId: clienteId ?? undefined,
      leadId:    leadId    ?? undefined,
      origem:    'usuario',
      metadados: { registradoPorAI: true, solicitante: ctx.solicitanteAI },
    })

    if (!resultado.ok) {
      return {
        sucesso: false,
        erro:    resultado.erro,
        resumo:  `Falha ao enviar e-mail para ${para}: ${resultado.erro}`,
      }
    }

    return {
      sucesso: true,
      dados:   { messageId: resultado.messageId },
      resumo:  `E-mail enviado para ${para} com assunto "${assunto}".`,
    }
  },
}

registrarTool(enviarEmailTool)
