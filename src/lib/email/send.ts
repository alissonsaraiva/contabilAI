import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { setSmtpOk, setSmtpErro } from './smtp-status'
import { getDownloadUrl } from '@/lib/storage'

export type Anexo = {
  nome: string
  mimeType?: string
} & ({ url: string; content?: never } | { content: Buffer; url?: never })

export type SendEmailOpts = {
  para: string
  assunto: string
  corpo: string           // HTML ou texto plano
  replyTo?: string
  inReplyTo?:      string   // Message-ID do email sendo respondido
  customMessageId?: string  // Nosso Message-ID para rastreamento de thread
  anexos?: Anexo[]
}

export type SendEmailResult = {
  ok: true
  messageId: string
} | {
  ok: false
  erro: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Resolve a URL para download — se for URL do R2 (STORAGE_PUBLIC_URL),
 * gera URL assinada (5 min) antes de fazer fetch. Bucket R2 é privado.
 */
async function resolveAnexoUrl(url: string): Promise<string> {
  const publicBase = (process.env.STORAGE_PUBLIC_URL ?? '').replace(/\/$/, '')
  if (publicBase && url.startsWith(publicBase)) {
    const key = url.slice(publicBase.length + 1)
    return getDownloadUrl(key, 300)
  }
  return url
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn() }
    catch (err) {
      if (attempt === maxAttempts) throw err
      await new Promise(r => setTimeout(r, 500 * 2 ** (attempt - 1)))
    }
  }
  throw new Error('unreachable')
}

// ─── Resend (REST API) ────────────────────────────────────────────────────────

async function sendViaResend(opts: SendEmailOpts): Promise<SendEmailResult> {
  const apiKey    = process.env.RESEND_API_KEY!
  const emailFrom = process.env.RESEND_FROM ?? 'onboarding@resend.dev'

  // Busca o nome do remetente — emailNome > nome do escritório > EMAIL_NOME env
  const escritorio = await prisma.escritorio.findFirst({
    select: { emailNome: true, nome: true },
  })
  const nomeRemetente = escritorio?.emailNome?.trim()
    || escritorio?.nome?.trim()
    || process.env.EMAIL_NOME
    || ''
  const from = nomeRemetente ? `${nomeRemetente} <${emailFrom}>` : emailFrom

  // Baixa os anexos e converte para base64 (formato exigido pela API do Resend)
  const attachments = opts.anexos && opts.anexos.length > 0
    ? await Promise.all(
        opts.anexos.map(async (a) => {
          let buf: Buffer
          if (a.content) {
            buf = a.content
          } else {
            const resolvedUrl = await resolveAnexoUrl(a.url!)
            const ac = new AbortController()
            const at = setTimeout(() => ac.abort(), 10_000)
            let res: Response
            try { res = await fetch(resolvedUrl, { signal: ac.signal }) } finally { clearTimeout(at) }
            if (!res.ok) throw new Error(`Falha ao baixar anexo "${a.nome}": HTTP ${res.status}`)
            buf = Buffer.from(await res.arrayBuffer())
          }
          return {
            filename:     a.nome,
            content:      buf.toString('base64'),
            content_type: a.mimeType || 'application/octet-stream',
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
  const customHeaders: Record<string, string> = {}
  if (opts.inReplyTo)       customHeaders['In-Reply-To'] = opts.inReplyTo
  if (opts.inReplyTo)       customHeaders['References']   = opts.inReplyTo
  if (opts.customMessageId) customHeaders['Message-ID']   = opts.customMessageId
  if (Object.keys(customHeaders).length > 0) body.headers = customHeaders

  const res = await withRetry(() => fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  }))

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
          let buf: Buffer
          if (a.content) {
            buf = a.content
          } else {
            const resolvedUrl = await resolveAnexoUrl(a.url!)
            const ac = new AbortController()
            const at = setTimeout(() => ac.abort(), 10_000)
            let res: Response
            try { res = await fetch(resolvedUrl, { signal: ac.signal }) } finally { clearTimeout(at) }
            if (!res.ok) throw new Error(`Falha ao baixar anexo "${a.nome}": HTTP ${res.status}`)
            buf = Buffer.from(await res.arrayBuffer())
          }
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
    inReplyTo:  opts.inReplyTo,
    references: opts.inReplyTo,
    messageId:  opts.customMessageId,
    attachments,
  })

  return { ok: true, messageId: info.messageId }
}

// ─── API pública ──────────────────────────────────────────────────────────────

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  if (!emailRegex.test(opts.para)) {
    return { ok: false, erro: `Email inválido: ${opts.para}` }
  }
  const provider = process.env.RESEND_API_KEY ? 'resend' : 'smtp'
  try {
    const result = provider === 'resend' ? await sendViaResend(opts) : await sendViaSmtp(opts)
    if (result.ok) setSmtpOk(provider)
    else setSmtpErro(result.erro, provider)
    return result
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err)
    setSmtpErro(erro, provider)
    // import estático não disponível neste módulo — Sentry já capturado via SDK global
    const Sentry = await import('@sentry/nextjs').catch(() => null)
    Sentry?.captureException(err, { tags: { module: 'email-send', operation: provider }, extra: { para: opts.para, assunto: opts.assunto } })
    return { ok: false, erro }
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
