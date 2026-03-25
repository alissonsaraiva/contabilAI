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

async function getTransporter() {
  const escritorio = await prisma.escritorio.findFirst({
    select: { emailRemetente: true, emailNome: true, emailSenha: true },
  })

  const remetente = escritorio?.emailRemetente ?? process.env.EMAIL_REMETENTE
  const senha     = escritorio?.emailSenha     ?? process.env.EMAIL_SENHA
  const nome      = escritorio?.emailNome      ?? process.env.EMAIL_NOME ?? ''

  if (!remetente || !senha) {
    throw new Error('Email remetente não configurado. Configure em CRM → Configurações → Contato.')
  }

  const senhaDecriptada = isEncrypted(senha) ? decrypt(senha) : senha

  return {
    transporter: nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 587,
      secure: false,
      auth: { user: remetente, pass: senhaDecriptada },
    }),
    from: nome ? `${nome} <${remetente}>` : remetente,
  }
}

export async function sendEmail(opts: SendEmailOpts): Promise<SendEmailResult> {
  try {
    const { transporter, from } = await getTransporter()

    // Baixa anexos de URL para buffer (S3 presigned URLs)
    const attachments = opts.anexos
      ? await Promise.all(
          opts.anexos.map(async (a) => {
            const res = await fetch(a.url)
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
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}

export async function testarConexaoSmtp(): Promise<{ ok: boolean; erro?: string }> {
  try {
    const { transporter } = await getTransporter()
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}
