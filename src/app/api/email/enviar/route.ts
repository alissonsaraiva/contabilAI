import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { enviarEmailComHistorico } from '@/lib/email/com-historico'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  clienteId:         z.string().uuid().optional(),
  leadId:            z.string().uuid().optional(),
  para:              z.string().email(),
  assunto:           z.string().min(1),
  corpo:             z.string().min(1),
  // Quando responder a um email recebido — marca a interação origem como respondida
  interacaoOrigemId: z.string().uuid().optional(),
  inReplyToMessageId: z.string().optional(),
  emailThreadId:      z.string().optional(),
  // Anexos referenciando documentos já existentes no banco
  anexos: z.array(z.object({
    documentoId: z.string().uuid().optional(),  // documento existente
    nome:        z.string(),
    url:         z.string().min(1),
    mimeType:    z.string().optional(),
  })).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors
    const msg = Object.entries(fields).map(([k, v]) => `${k}: ${v?.join(', ')}`).join('; ')
    return NextResponse.json({ error: msg || 'Dados inválidos' }, { status: 400 })
  }

  const { clienteId, leadId, para, assunto, corpo, interacaoOrigemId, anexos, inReplyToMessageId, emailThreadId } = parsed.data
  const usuarioId = (session.user as any).id as string | undefined

  const resultado = await enviarEmailComHistorico({
    para,
    assunto,
    corpo,
    clienteId,
    leadId,
    usuarioId,
    origem: 'usuario',
    interacaoOrigemId,
    inReplyToMessageId,
    emailThreadId,
    anexos: anexos?.map(a => ({ nome: a.nome, url: a.url, mimeType: a.mimeType })),
    metadados: {
      anexos: anexos?.map(a => ({ nome: a.nome, url: a.url, mimeType: a.mimeType })) ?? [],
    },
  })

  if (!resultado.ok) {
    const errMsg = resultado.erro ?? 'Erro ao enviar e-mail'
    try { const Sentry = await import('@sentry/nextjs'); Sentry.captureMessage(errMsg, 'error') } catch {}
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }

  // Marca todos os email_recebido pendentes da thread como respondidos.
  // Usa emailThreadId para cobrir threads multi-turno onde o cliente respondeu várias vezes.
  // Fallback para interacaoOrigemId caso emailThreadId não esteja disponível.
  const respondidoEm  = new Date()
  if (emailThreadId || interacaoOrigemId) {
    try {
      await prisma.interacao.updateMany({
        where: emailThreadId
          ? { emailThreadId, tipo: 'email_recebido', respondidoEm: null }
          : { id: interacaoOrigemId!, tipo: 'email_recebido', respondidoEm: null },
        data: { respondidoEm, respondidoPorId: usuarioId },
      })
    } catch (err: unknown) {
      console.error('[email/enviar] erro ao marcar interações como respondidas:', { emailThreadId, interacaoOrigemId, err })
      Sentry.captureException(err, {
        tags:  { module: 'email-enviar', operation: 'marcar-respondida' },
        extra: { emailThreadId, interacaoOrigemId, usuarioId },
      })
    }
  }

  return NextResponse.json({ ok: true, messageId: resultado.messageId })
}
