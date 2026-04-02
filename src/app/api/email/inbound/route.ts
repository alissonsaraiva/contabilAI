import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { processarEmailRecebido } from '@/lib/email/processar'
import type { EmailRecebido } from '@/lib/email/imap'

// Payload enviado pelo Resend Inbound
// Ref: https://resend.com/docs/dashboard/emails/inbound
type ResendInboundAttachment = {
  filename: string
  mimeType: string
  content:  string  // base64
}

type ResendInboundPayload = {
  from:        string   // "Nome <email>" ou só "email"
  to:          string | string[]
  subject:     string
  text?:       string
  html?:       string
  messageId?:  string
  inReplyTo?:  string
  references?:  string | string[]
  date?:       string
  attachments?: ResendInboundAttachment[]
}

function verificarSecret(req: Request): boolean {
  const secret = process.env.RESEND_INBOUND_SECRET
  if (!secret) return true  // dev sem secret — permite
  return req.headers.get('x-resend-secret') === secret
}

function parseFrom(from: string): { email: string; nome: string } {
  // Suporta "Nome Sobrenome <email@exemplo.com>" ou só "email@exemplo.com"
  const match = from.match(/^(.+?)\s*<(.+?)>$/)
  if (match) return { nome: match[1].trim(), email: match[2].trim() }
  return { nome: from.trim(), email: from.trim() }
}

export async function POST(req: Request) {
  if (!verificarSecret(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let payload: ResendInboundPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { email: de, nome: nomeRemetente } = parseFrom(payload.from ?? '')
  if (!de) {
    return NextResponse.json({ error: 'Campo "from" ausente' }, { status: 400 })
  }

  // Converte anexos base64 → Buffer
  const anexos: EmailRecebido['anexos'] = []
  for (const att of payload.attachments ?? []) {
    if (att.filename && att.content) {
      try {
        anexos.push({
          nome:     att.filename,
          mimeType: att.mimeType || 'application/octet-stream',
          buffer:   Buffer.from(att.content, 'base64'),
        })
      } catch {
        // Anexo com conteúdo inválido — ignora
      }
    }
  }

  const emailRecebido: EmailRecebido = {
    uid:            0,  // campo IMAP — não aplicável para inbound webhook
    messageId:      payload.messageId ?? `resend-${Date.now()}`,
    inReplyTo:      payload.inReplyTo ?? null,
    references:     Array.isArray(payload.references)
      ? payload.references
      : payload.references ? [payload.references] : [],
    de,
    nomeRemetente,
    assunto:        payload.subject   ?? '(sem assunto)',
    corpo:          (payload.text || payload.html || '').slice(0, 5000),
    corpoHtml:      payload.html,
    dataEnvio:      payload.date ? new Date(payload.date) : new Date(),
    anexos,
  }

  try {
    const resultado = await processarEmailRecebido(emailRecebido)
    return NextResponse.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('[email/inbound] Erro ao processar:', err)
    Sentry.captureException(err, { tags: { module: 'email-inbound', operation: 'processar-email' } })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
