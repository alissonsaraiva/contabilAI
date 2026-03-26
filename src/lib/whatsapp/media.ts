import type { EvolutionConfig } from '@/lib/evolution'

type MediaResult = {
  buffer: Buffer
  mimeType: string
  fileName?: string
}

// Baixa mídia da Evolution API convertendo para base64
export async function downloadMedia(
  cfg: EvolutionConfig,
  messageData: Record<string, unknown>,
): Promise<MediaResult | null> {
  try {
    const url = `${cfg.baseUrl.replace(/\/$/, '')}/message/getBase64FromMediaMessage/${cfg.instance}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.apiKey,
      },
      body: JSON.stringify({ message: messageData }),
    })

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
export function detectMediaType(msg: Record<string, unknown>): 'audio' | 'image' | 'document' | null {
  if (msg.audioMessage || msg.pttMessage) return 'audio'
  if (msg.imageMessage) return 'image'
  if (msg.documentMessage || msg.documentWithCaptionMessage) return 'document'
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
