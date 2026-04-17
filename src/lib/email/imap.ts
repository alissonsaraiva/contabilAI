import * as Sentry from '@sentry/nextjs'
import { resolve4 } from 'dns/promises'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

/**
 * Resolve o hostname IMAP para IPv4 explicitamente.
 * Evita ENETUNREACH em containers Docker sem IPv6 onde o Node.js tenta ambos
 * os stacks via Happy Eyeballs e falha no AAAA antes do A.
 * Quando a resolução funciona, retorna o IP + servername original para que o
 * TLS valide o certificado pelo hostname correto (não pelo IP).
 */
async function resolveImapIPv4(host: string): Promise<{ host: string; servername?: string }> {
  try {
    const addresses = await resolve4(host)
    const ip = addresses[0]
    if (ip && ip !== host) return { host: ip, servername: host }
  } catch {
    // fallback: usa hostname diretamente — sem alteração
  }
  return { host }
}

export type EmailRecebido = {
  uid: number
  messageId: string
  inReplyTo:  string | null
  references: string[]
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
  const resolved = await resolveImapIPv4(imapHost)
  const client = new ImapFlow({
    host:          resolved.host,
    port:          imapPort,
    secure:        imapPort === 993,
    auth:          { user: usuario, pass: senha },
    logger:        false,
    socketTimeout: 10_000,
    ...(resolved.servername ? { tls: { servername: resolved.servername } } : {}),
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
  const resolved = await resolveImapIPv4(imapHost)

  const client = new ImapFlow({
    host:          resolved.host,
    port:          imapPort,
    secure:        imapPort === 993,
    auth:          { user: usuario, pass: senha },
    logger:        false,
    socketTimeout: 30_000,  // 30s — evita hang em servidor IMAP travado
    ...(resolved.servername ? { tls: { servername: resolved.servername } } : {}),
  })
  // Evita uncaughtException: ImapFlow emite 'error' via EventEmitter antes de rejeitar a Promise
  client.on('error', () => {})

  const emails: EmailRecebido[] = []
  // UIDs coletados com sucesso — precisam ser marcados como lidos
  const uidsColetados: number[] = []

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
            const inReplyTo   = parsed.inReplyTo ?? null
            const references  = Array.isArray(parsed.references)
              ? parsed.references
              : parsed.references ? [parsed.references] : []

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

            emails.push({ uid: msg.uid, messageId, inReplyTo, references, de, nomeRemetente, assunto, corpo, corpoHtml, dataEnvio, anexos })
            uidsColetados.push(msg.uid)

            // Tenta marcar como lido na conexão ativa
            try {
              await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'])
            } catch (flagErr) {
              // Falha silenciosa aqui: se a conexão caiu, o handler de NoConnection
              // abaixo reabre conexão e marca todos os uidsColetados em lote
              console.error('[imap] Falha ao marcar email como lido, uid:', msg.uid, flagErr)
            }
          } catch (parseErr) {
            console.error('[imap] Email malformado ignorado, uid:', (msg as any)?.uid, parseErr)
          }
        }
      } catch (iterErr: any) {
        // "Connection not available" ocorre quando o servidor IMAP fecha o socket após
        // entregar a última mensagem (ou antes, em servidores com timeout curto).
        // Os emails já coletados em `emails` são válidos.
        if (iterErr?.code !== 'NoConnection') {
          Sentry.captureException(iterErr, { tags: { module: 'email-imap', operation: 'fetch-messages' } })
          throw iterErr
        }
        console.error('[imap] Conexão encerrada durante fetch, emails parciais:', emails.length)

        // Reconecta apenas para marcar os UIDs coletados como lidos — evita que o mesmo
        // email fique preso em loop infinito por nunca receber o flag \Seen
        if (uidsColetados.length > 0) {
          await marcarComoLidosReconectando(config, uidsColetados)
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    try { await client.logout() } catch { /* conexão pode já estar fechada */ }
  }

  return emails
}

/** Abre nova conexão IMAP só para marcar UIDs como \Seen — usado após queda da conexão principal */
async function marcarComoLidosReconectando(
  config: NonNullable<Awaited<ReturnType<typeof getImapConfig>>>,
  uids: number[],
): Promise<void> {
  const uidSeq = uids.join(',')
  const resolved = await resolveImapIPv4(config.imapHost)
  const client = new ImapFlow({
    host:          resolved.host,
    port:          config.imapPort,
    secure:        config.imapPort === 993,
    auth:          { user: config.usuario, pass: config.senha },
    logger:        false,
    socketTimeout: 10_000,
    ...(resolved.servername ? { tls: { servername: resolved.servername } } : {}),
  })
  client.on('error', () => {})
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      await client.messageFlagsAdd(uidSeq, ['\\Seen'], { uid: true })
      console.log('[imap] Emails marcados como lidos após reconexão, uids:', uids)
    } finally {
      lock.release()
    }
  } catch (err) {
    console.error('[imap] Falha ao marcar emails como lidos na reconexão:', err)
    Sentry.captureException(err, { tags: { module: 'email-imap', operation: 'reconnect-mark-seen' } })
  } finally {
    try { await client.logout() } catch { /* ok */ }
  }
}
