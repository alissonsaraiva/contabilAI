import * as Sentry from '@sentry/nextjs'
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
    select: { emailRemetente: true, emailSenha: true, emailImapHost: true, emailImapPort: true },
  })

  const usuario  = escritorio?.emailRemetente ?? process.env.EMAIL_REMETENTE
  const senha    = escritorio?.emailSenha     ?? process.env.EMAIL_SENHA

  // Sem credenciais não há como conectar
  if (!usuario || !senha) return null

  const imapHost = escritorio?.emailImapHost ?? process.env.EMAIL_IMAP_HOST ?? 'imap.hostinger.com'
  const imapPort = escritorio?.emailImapPort  ?? 993

  const senhaDecriptada = isEncrypted(senha) ? decrypt(senha) : senha

  return { usuario, senha: senhaDecriptada, imapHost, imapPort }
}

export async function testarConexaoImap(): Promise<{ ok: boolean; erro?: string }> {
  const config = await getImapConfig()
  if (!config) return { ok: false, erro: 'IMAP não configurado. Preencha o servidor IMAP e salve.' }

  const { usuario, senha, imapHost, imapPort } = config
  const client = new ImapFlow({
    host:          imapHost,
    port:          imapPort,
    secure:        imapPort === 993,
    auth:          { user: usuario, pass: senha },
    logger:        false,
    socketTimeout: 10_000,
  })
  // Evita uncaughtException: ImapFlow emite 'error' via EventEmitter antes de rejeitar a Promise
  client.on('error', () => {})

  try {
    await client.connect()
    await client.logout()
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) }
  }
}

export async function buscarEmailsNovos(): Promise<EmailRecebido[]> {
  const config = await getImapConfig()
  if (!config) return []  // IMAP não configurado — pula silenciosamente

  const { usuario, senha, imapHost, imapPort } = config

  const client = new ImapFlow({
    host:          imapHost,
    port:          imapPort,
    secure:        imapPort === 993,
    auth:          { user: usuario, pass: senha },
    logger:        false,
    socketTimeout: 30_000,  // 30s — evita hang em servidor IMAP travado
  })
  // Evita uncaughtException: ImapFlow emite 'error' via EventEmitter antes de rejeitar a Promise
  client.on('error', () => {})

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

      try {
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

            // Marca como lido somente após parsing bem-sucedido
            // (mover para antes causaria perda silenciosa se processarEmailRecebido falhar)
            try {
              await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'])
            } catch (flagErr) {
              console.error('[imap] Falha ao marcar email como lido, uid:', msg.uid, flagErr)
            }
          } catch (parseErr) {
            console.error('[imap] Email malformado ignorado, uid:', (msg as any)?.uid, parseErr)
          }
        }
      } catch (iterErr: any) {
        // "Connection not available" pode ocorrer quando o socket fecha após a última
        // mensagem ser entregue (ex: socket timeout do servidor). Os emails já coletados
        // em `emails` são válidos — apenas abortamos o fetch sem propagar o erro.
        if (iterErr?.code !== 'NoConnection') {
          Sentry.captureException(iterErr, { tags: { module: 'email-imap', operation: 'fetch-messages' } })
          throw iterErr
        }
        console.error('[imap] Conexão encerrada durante fetch, emails parciais:', emails.length)
      }
    } finally {
      lock.release()
    }
  } finally {
    try { await client.logout() } catch { /* conexão pode já estar fechada */ }
  }

  return emails
}
