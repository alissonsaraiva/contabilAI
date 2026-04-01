import { createDecipheriv, createHmac } from 'crypto'
import * as Sentry from '@sentry/nextjs'
import type { EvolutionConfig } from '@/lib/evolution'

type MediaResult = {
  buffer: Buffer
  mimeType: string
  fileName?: string
}

// ─── Download direto do CDN do WhatsApp (bypass Evolution API) ────────────────
// Usado quando getBase64FromMediaMessage falha (ex: addressingMode: 'lid')
// Implementa o protocolo de descriptografia do WhatsApp (Baileys spec):
//   arquivo CDN = [ AES-256-CBC ciphertext | 10-byte HMAC-SHA256 MAC ]
//   chave derivada via HKDF-SHA256(mediaKey, 112 bytes, info="WhatsApp <Type> Keys")

function hkdfSha256(key: Buffer, length: number, info: string): Buffer {
  const salt = Buffer.alloc(32, 0)
  const prk  = createHmac('sha256', salt).update(key).digest()
  const infoBuffer = Buffer.from(info, 'utf8')
  const blocks: Buffer[] = []
  let prev = Buffer.alloc(0)
  let generated = 0
  for (let i = 1; generated < length; i++) {
    const hmac = createHmac('sha256', prk)
    hmac.update(prev)
    hmac.update(infoBuffer)
    hmac.update(Buffer.from([i]))
    prev = hmac.digest()
    blocks.push(prev)
    generated += prev.length
  }
  return Buffer.concat(blocks).subarray(0, length)
}

const WHATSAPP_HKDF_INFO: Record<string, string> = {
  document: 'WhatsApp Document Keys',
  image:    'WhatsApp Image Keys',
  audio:    'WhatsApp Audio Keys',
  ptt:      'WhatsApp Audio Keys',
  video:    'WhatsApp Video Keys',
  sticker:  'WhatsApp Image Keys',
}

function mediaKeyToBuffer(raw: unknown): Buffer | null {
  if (!raw) return null
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof Uint8Array) return Buffer.from(raw)
  if (typeof raw === 'object') {
    const obj = raw as Record<string, number>
    const len = Object.keys(obj).length
    if (len === 0) return null
    const arr = new Uint8Array(len)
    for (let i = 0; i < len; i++) arr[i] = obj[String(i)]
    return Buffer.from(arr)
  }
  return null
}

function decryptWhatsAppMedia(encrypted: Buffer, mediaKey: Buffer, mediaType: string): Buffer {
  const info = WHATSAPP_HKDF_INFO[mediaType] ?? WHATSAPP_HKDF_INFO.document
  const expanded  = hkdfSha256(mediaKey, 112, info)
  const iv        = expanded.subarray(0, 16)
  const cipherKey = expanded.subarray(16, 48)
  const macKey    = expanded.subarray(48, 80)

  const MAC_LEN    = 10
  const ciphertext = encrypted.subarray(0, encrypted.length - MAC_LEN)
  const storedMac  = encrypted.subarray(encrypted.length - MAC_LEN)

  const computedMac = createHmac('sha256', macKey)
    .update(iv)
    .update(ciphertext)
    .digest()
    .subarray(0, MAC_LEN)

  if (!computedMac.equals(storedMac)) {
    throw new Error('WhatsApp media MAC verification failed')
  }

  const decipher = createDecipheriv('aes-256-cbc', cipherKey, iv)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// Extrai campos de mídia de uma mensagem WhatsApp (documentMessage, imageMessage, etc.)
function extractMediaFields(msg: Record<string, unknown>): {
  url: string
  mediaKey: unknown
  mimeType: string
  fileName?: string
  mediaType: string
} | null {
  const docMsg = (msg.documentMessage ?? msg.documentWithCaptionMessage) as Record<string, unknown> | undefined
  const imgMsg = msg.imageMessage as Record<string, unknown> | undefined
  const audMsg = (msg.audioMessage ?? msg.pttMessage) as Record<string, unknown> | undefined
  const vidMsg = msg.videoMessage as Record<string, unknown> | undefined

  const src = docMsg ?? imgMsg ?? audMsg ?? vidMsg
  if (!src) return null

  const url = (src.url ?? src.directPath) as string | undefined
  if (!url) return null

  return {
    url,
    mediaKey:  src.mediaKey,
    mimeType:  (src.mimetype as string | undefined) ?? 'application/octet-stream',
    fileName:  src.fileName as string | undefined,
    mediaType: docMsg ? 'document' : imgMsg ? 'image' : audMsg ? 'audio' : 'video',
  }
}

/**
 * Baixa e descriptografa mídia diretamente do CDN do WhatsApp.
 * Fallback para quando a Evolution API falha (ex: addressingMode: 'lid').
 * Recebe o objeto `message` do whatsappMsgData.
 */
export async function downloadMediaDirect(
  message: Record<string, unknown>,
): Promise<MediaResult | null> {
  try {
    const fields = extractMediaFields(message)
    if (!fields) return null

    const mediaKey = mediaKeyToBuffer(fields.mediaKey)
    if (!mediaKey || mediaKey.length !== 32) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    let res: Response
    try {
      res = await fetch(fields.url, { signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) return null

    const encrypted = Buffer.from(await res.arrayBuffer())
    const decrypted = decryptWhatsAppMedia(encrypted, mediaKey, fields.mediaType)

    return {
      buffer:   decrypted,
      mimeType: fields.mimeType,
      fileName: fields.fileName,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[media] downloadMediaDirect falhou:', msg)
    // Captura somente erros inesperados — falhas de rede/MAC são esperadas e não alertam
    if (!(err instanceof Error && (msg.includes('MAC') || msg.includes('abort')))) {
      Sentry.captureException(err, { tags: { module: 'whatsapp-media', operation: 'downloadMediaDirect' } })
    }
    return null
  }
}

// Baixa mídia da Evolution API convertendo para base64
export async function downloadMedia(
  cfg: EvolutionConfig,
  messageData: Record<string, unknown>,
): Promise<MediaResult | null> {
  try {
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/message/getBase64FromMediaMessage/${cfg.instance}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.apiKey,
        },
        body: JSON.stringify({ message: messageData }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) return null

    const data = await res.json() as { base64?: string; mimetype?: string; fileName?: string }
    if (!data.base64) return null

    return {
      buffer: Buffer.from(data.base64, 'base64'),
      mimeType: data.mimetype ?? 'application/octet-stream',
      fileName: data.fileName,
    }
  } catch {
    return null
  }
}

// Extrai texto de PDF
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const result = await pdfParse(buffer)
  return result.text.trim()
}

// Detecta tipo de mídia a partir da mensagem WhatsApp
export function detectMediaType(msg: Record<string, unknown>): 'audio' | 'image' | 'document' | 'sticker' | null {
  if (msg.audioMessage || msg.pttMessage) return 'audio'
  if (msg.imageMessage) return 'image'
  if (msg.documentMessage || msg.documentWithCaptionMessage) return 'document'
  if (msg.stickerMessage) return 'sticker'
  return null
}

// Extrai caption/legenda da mensagem de mídia
export function extractMediaCaption(msg: Record<string, unknown>): string {
  const imgMsg = msg.imageMessage as Record<string, unknown> | undefined
  const docMsg = msg.documentMessage as Record<string, unknown> | undefined
  const docCapMsg = msg.documentWithCaptionMessage as Record<string, unknown> | undefined
  return (imgMsg?.caption ?? docMsg?.caption ?? docCapMsg?.caption ?? '') as string
}

// Extrai mimetype da mensagem de mídia
export function extractMimeType(msg: Record<string, unknown>): string {
  const audio = (msg.audioMessage ?? msg.pttMessage) as Record<string, unknown> | undefined
  const image = msg.imageMessage as Record<string, unknown> | undefined
  const doc = (msg.documentMessage ?? msg.documentWithCaptionMessage) as Record<string, unknown> | undefined
  return (audio?.mimetype ?? image?.mimetype ?? doc?.mimetype ?? 'application/octet-stream') as string
}
