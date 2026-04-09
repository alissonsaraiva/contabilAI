/**
 * Stage 1 do pipeline webhook WhatsApp:
 * Validação, parsing, filtros e sanitização da mensagem recebida.
 *
 * Responsabilidades:
 *   - Autenticação via WEBHOOK_SECRET
 *   - Parse do body JSON
 *   - Filtros: fromMe, grupos, broadcast, reações, edições, stickers, etc.
 *   - Deduplicação de mensagens (Set in-memory)
 *   - Rate limiting por remoteJid
 *   - Extração de texto, truncamento, sanitização
 *   - Detecção de jailbreak/prompt injection
 */

import * as Sentry from '@sentry/nextjs'
import { RATE_LIMIT_MS, MAX_MSG_LENGTH, JAILBREAK_PATTERNS } from '@/lib/whatsapp/constants'
import { detectMediaType } from '@/lib/whatsapp/media'
import type { ValidacaoResult } from './types'

// Cache de mensagens já processadas (reinicia com o servidor)
const processed = new Set<string>()

// Rate limiting: timestamp da última resposta enviada por número
const lastResponse = new Map<string, number>()

/** Atualiza o timestamp de rate limit para um remoteJid (chamado após salvar no DB). */
export function marcarResposta(remoteJid: string): void {
  lastResponse.set(remoteJid, Date.now())
}

/**
 * Valida, parseia e filtra a requisição do webhook.
 * Retorna `{ ok: false }` com resposta HTTP para rejeitar, ou `{ ok: true }` com dados extraídos.
 */
export async function validarWebhook(req: Request): Promise<ValidacaoResult> {
  // ── Auth WEBHOOK_SECRET ───────────────────────────────────────────────────
  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET
  if (WEBHOOK_SECRET) {
    const headerApiKey = req.headers.get('apikey')
    if (headerApiKey !== WEBHOOK_SECRET) {
      Sentry.captureMessage('Webhook WhatsApp rejeitado: WEBHOOK_SECRET inválido', {
        level: 'warning',
        tags:  { module: 'whatsapp-webhook', operation: 'auth-secret' },
        extra: { receivedPrefix: headerApiKey?.slice(0, 6) ?? 'ausente' },
      })
      return { ok: false, response: 'unauthorized', status: 401 }
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return { ok: false, response: 'bad request', status: 400 } }

  const event = (body.event as string ?? '').toLowerCase()
  if (!event.includes('messages')) return { ok: false, response: 'ignored', status: 200 }

  const data = body.data as Record<string, unknown> | null
  if (!data) return { ok: false, response: 'no data', status: 200 }

  const key = data.key as Record<string, unknown> | null
  if (!key || key.fromMe) return { ok: false, response: 'fromMe', status: 200 }

  // ── Deduplicação ──────────────────────────────────────────────────────────
  const messageId = key.id as string
  if (processed.has(messageId)) return { ok: false, response: 'dup', status: 200 }
  processed.add(messageId)
  if (processed.size > 5000) {
    const first = processed.values().next().value
    if (first) processed.delete(first)
  }

  const remoteJid = key.remoteJid as string

  // ── Filtros de origens não-humanas ────────────────────────────────────────
  if (remoteJid.includes('@g.us'))        return { ok: false, response: 'group', status: 200 }
  if (remoteJid.includes('@broadcast') || remoteJid.startsWith('status@'))
    return { ok: false, response: 'broadcast', status: 200 }
  if (remoteJid.includes('@newsletter'))  return { ok: false, response: 'newsletter', status: 200 }

  // ── Filtros de tipo de mensagem ───────────────────────────────────────────
  const msg = data.message as Record<string, unknown> | null

  if (msg?.reactionMessage)  return { ok: false, response: 'reaction', status: 200 }
  if (msg?.editedMessage || (data.messageType as string) === 'editedMessage')
    return { ok: false, response: 'edit', status: 200 }
  if (msg?.protocolMessage)  return { ok: false, response: 'protocol', status: 200 }
  if (data.messageStubType)  return { ok: false, response: 'stub', status: 200 }
  if (msg?.pollCreationMessage || msg?.pollUpdateMessage) return { ok: false, response: 'poll', status: 200 }
  if (msg?.contactMessage || msg?.contactsArrayMessage)   return { ok: false, response: 'contact', status: 200 }
  if (msg?.locationMessage || msg?.liveLocationMessage)    return { ok: false, response: 'location', status: 200 }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const now = Date.now()
  const last = lastResponse.get(remoteJid)
  if (last && now - last < RATE_LIMIT_MS) return { ok: false, response: 'rate_limited', status: 200 }

  // ── Extração de texto ─────────────────────────────────────────────────────
  const textRaw = (
    (msg?.conversation as string | undefined) ||
    ((msg?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ||
    ''
  ).trim()

  const mediaType = msg ? detectMediaType(msg) : null

  // Stickers/GIFs — ignora silenciosamente
  if (mediaType === 'sticker') return { ok: false, response: 'sticker_ignored', status: 200 }

  // Sem texto nem mídia
  if (!textRaw && !mediaType) return { ok: false, response: 'no text', status: 200 }

  // ── Truncamento ───────────────────────────────────────────────────────────
  const textTruncado = textRaw.length > MAX_MSG_LENGTH ? textRaw.slice(0, MAX_MSG_LENGTH) : textRaw
  if (textRaw.length > MAX_MSG_LENGTH) {
    console.warn('[whatsapp/webhook] mensagem truncada:', { remoteJid, originalLength: textRaw.length, maxLength: MAX_MSG_LENGTH })
    Sentry.captureMessage('Mensagem WhatsApp truncada por exceder limite', {
      level: 'warning',
      tags:  { module: 'whatsapp-webhook', operation: 'truncar-mensagem' },
      extra: { remoteJid, originalLength: textRaw.length, maxLength: MAX_MSG_LENGTH },
    })
  }

  // ── Sanitização ───────────────────────────────────────────────────────────
  const textSanitizado = textTruncado.replace(/##LEAD##|##HUMANO##/gi, '').trim()
  if (!textSanitizado && !mediaType) return { ok: false, response: 'no text after sanitize', status: 200 }

  // ── Jailbreak detection ───────────────────────────────────────────────────
  const isJailbreakAttempt = JAILBREAK_PATTERNS.some(p => p.test(textSanitizado))
  if (isJailbreakAttempt) {
    console.warn('[whatsapp/webhook] jailbreak attempt detected from:', remoteJid, '| msg:', textSanitizado.slice(0, 80))
    Sentry.captureMessage('Tentativa de jailbreak bloqueada via WhatsApp', {
      level: 'warning',
      tags:  { module: 'whatsapp-webhook', operation: 'jailbreak-block' },
      extra: { remoteJid, snippet: textSanitizado.slice(0, 120) },
    })
    return { ok: false, response: 'blocked', status: 200 }
  }

  return {
    ok: true,
    remoteJid,
    key: key as Record<string, unknown>,
    msg,
    textSanitizado,
    mediaType,
  }
}
