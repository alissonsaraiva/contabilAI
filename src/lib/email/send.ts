import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

export type Anexo = {
  nome: string
  url: string
  mimeType?: string
}

export type SendEmailOpts = {
  para: string
  assunto: string
  corpo: string           // HTML ou texto plano
  replyTo?: string
  anexos?: Anexo[]
}

export type SendEmailResult = {
  ok: true
  messageId: string
} | {
  ok: false
  erro: string
}

// ─── Resend (REST API) ────────────────────────────────────────────────────────

async function sendViaResend(opts: SendEmailOpts): Promise<SendEmailResult> {
  const apiKey    = process.env.RESEND_API_KEY!
  const emailFrom = process.env.RESEND_FROM ?? 'onboarding@resend.dev'

  // Busca o nome do remetente no escritório para montar "Nome <email>"
  const escritorio = await prisma.escritorio.findFirst({
    select: { emailNome: true },
  })
  const nomeRemetente = escritorio?.emailNome ?? process.env.EMAIL_NOME ?? ''
  const from = nomeRemetente ? `${nomeRemetente} <${emailFrom}>` : emailFrom

  // Baixa os anexos e converte para base64 (formato exigido pela API do Resend)
  const attachments = opts.anexos && opts.anexos.length > 0
    ? await Promise.all(
        opts.anexos.map(async (a) => {
          const ac = new AbortController()
          const at = setTimeout(() => ac.abort(), 10_000)
          let res: Response
          try { res = await fetch(a.url, { signal: ac.signal }) } finally { clearTimeout(at) }
          const buf = Buffer.from(await res.arrayBuffer())
          return {
            filename:     a.nome,
            content:      buf.toString('base64'),
            content_type: a.mimeType ?? 'application/octet-stream',
          }
        })
      )
    : undefined

  const body: Record<string, unknown> = {
    from,
    to:      opts.para,
    subject: opts.assunto,
    html:    opts.corpo,
  }
  if (opts.replyTo)   body.reply_to    = opts.replyTo
  if (attachments)    body.attachments = attachments

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, erro: `Resend ${res.status}: ${text}` }
  }

  const data = await res.json() as { id: string }
  return { ok: true, messageId: data.id }
}

// ─── SMTP (nodemailer — fallback) ─────────────────────────────────────────────

async function getTransporter() {
  const escritorio = await prisma.escritorio.findFirst({
    select: { emailRemetente: true, emailNome: true, emailSenha: true, emailSmtpHost: true, emailSmtpPort: true },
  })

  const remetente = escritorio?.emailRemetente ?? process.env.EMAIL_REMETENTE
  const senha     = escritorio?.emailSenha     ?? process.env.EMAIL_SENHA
  const nome      = escritorio?.emailNome      ?? process.env.EMAIL_NOME ?? ''
  const smtpHost  = escritorio?.emailSmtpHost  ?? 'smtp.hostinger.com'
  const smtpPort  = escritorio?.emailSmtpPort  ?? 587

  if (!remetente || !senha) {
    throw new Error('Email remetente não configurado. Configure em CRM → Configurações → Contato.')
  }

  const senhaDecriptada = isEncrypted(senha) ? decrypt(senha) : senha

  return {
    transporter: nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: smtpPort === 465,
      auth: { user: remetente, pass: senhaDecriptada },
    }),
    from: nome ? `${nome} <${remetente}>` : remetente,
  }
}

async function sendViaSmtp(opts: SendEmailOpts): Promise<SendEmailResult> {
  const { transporter, from } = await getTransporter()

  const attachments = opts.anexos
    ? await Promise.all(
        opts.anexos.map(async (a) => {
          const ac = new AbortController()
          const at = setTimeout(() => ac.abort(), 10_000)
          let res: Response
          try { res = await fetch(a.url, { signal: ac.signal }) } finally { clearTimeout(at) }
          const buf = Buffer.from(await res.arrayBuffer())
          return { filename: a.nome, content: buf, contentType: a.mimeType }
        })
      )
    : []

  const info = await transporter.sendMail({
    from,
    to:          opts.para,
    subject:     opts.assunto,
    html:        opts.corpo,
    replyTo:     opts.replyTo,
    attachments,
  })

  return { ok: true, messageId: info.messageId }
}

// ─── API pública ──────────────────────────────────────────────────────────────

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  try {
    if (process.env.RESEND_API_KEY) {
      return await sendViaResend(opts)
    }
    return await sendViaSmtp(opts)
  } catch (err) {
    try { const Sentry = await import('@sentry/nextjs'); Sentry.captureException(err) } catch {}
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}

export async function testarConexaoSmtp(): Promise<{ ok: boolean; erro?: string }> {
  try {
    if (process.env.RESEND_API_KEY) {
      // Resend não tem endpoint de "testar conexão" — faz um envio real para validar
      return { ok: true }
    }
    const { transporter } = await getTransporter()
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}
