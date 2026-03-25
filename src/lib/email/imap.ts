import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

export type EmailRecebido = {
  uid: number
  messageId: string
  de: string           // endereço de email do remetente
  nomeRemetente: string
  assunto: string
  corpo: string        // texto plano extraído
  corpoHtml?: string
  dataEnvio: Date
  anexos: Array<{ nome: string; mimeType: string; buffer: Buffer }>
}

async function getImapConfig() {
  const escritorio = await prisma.escritorio.findFirst({
    select: { emailRemetente: true, emailSenha: true },
  })

  const usuario = escritorio?.emailRemetente ?? process.env.EMAIL_REMETENTE
  const senha   = escritorio?.emailSenha     ?? process.env.EMAIL_SENHA

  if (!usuario || !senha) {
    throw new Error('Email IMAP não configurado.')
  }

  const senhaDecriptada = isEncrypted(senha) ? decrypt(senha) : senha

  return { usuario, senha: senhaDecriptada }
}

export async function buscarEmailsNovos(): Promise<EmailRecebido[]> {
  const { usuario, senha } = await getImapConfig()

  const client = new ImapFlow({
    host:   'imap.hostinger.com',
    port:   993,
    secure: true,
    auth:   { user: usuario, pass: senha },
    logger: false,
  })

  const emails: EmailRecebido[] = []

  try {
    await client.connect()

    const lock = await client.getMailboxLock('INBOX')
    try {
      // Busca UIDs dos emails não lidos
      const uids = await client.search({ seen: false }, { uid: true })
      const uidList = Array.isArray(uids) ? uids : []
      if (uidList.length === 0) return emails

      const messages = client.fetch(uidList, {
        uid:    true,
        source: true,
      }, { uid: true })

      for await (const msg of messages) {
        try {
          if (!msg.source) continue
          const parsed = await simpleParser(msg.source)

          const de          = parsed.from?.value?.[0]?.address ?? ''
          const nomeRemetente = parsed.from?.value?.[0]?.name ?? de
          const assunto     = parsed.subject ?? '(sem assunto)'
          const textoRaw  = typeof parsed.text === 'string' ? parsed.text : ''
          const htmlRaw   = typeof parsed.html === 'string' ? parsed.html : ''
          const corpo     = (textoRaw || htmlRaw).slice(0, 5000)
          const corpoHtml = typeof parsed.html === 'string' ? parsed.html : undefined
          const dataEnvio   = parsed.date    ?? new Date()
          const messageId   = parsed.messageId ?? `uid-${msg.uid}`

          const anexos: EmailRecebido['anexos'] = []
          for (const att of parsed.attachments ?? []) {
            if (att.content && att.filename) {
              anexos.push({
                nome:     att.filename,
                mimeType: att.contentType,
                buffer:   att.content,
              })
            }
          }

          emails.push({ uid: msg.uid, messageId, de, nomeRemetente, assunto, corpo, corpoHtml, dataEnvio, anexos })

          // Marca como lido após processar
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'])
        } catch {
          // Email malformado — ignora e continua
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }

  return emails
}
