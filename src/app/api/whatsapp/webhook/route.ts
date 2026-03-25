import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { sendText, type EvolutionConfig } from '@/lib/evolution'
import { askAI } from '@/lib/ai/ask'

// Desativa bodyParser para verificação futura de assinatura
export const runtime = 'nodejs'

// Cache simples para evitar processar o mesmo messageId duas vezes (restart limpa)
const processed = new Set<string>()

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }

  // Evolution API envia event = "messages.upsert" ou "MESSAGES_UPSERT"
  const event = (body.event as string ?? '').toLowerCase()
  if (!event.includes('messages')) return new Response('ignored', { status: 200 })

  const data = body.data as Record<string, unknown> | null
  if (!data) return new Response('no data', { status: 200 })

  const key = data.key as Record<string, unknown> | null
  if (!key) return new Response('no key', { status: 200 })

  // Ignora mensagens enviadas pelo próprio bot
  if (key.fromMe) return new Response('fromMe', { status: 200 })

  const messageId = key.id as string
  if (processed.has(messageId)) return new Response('dup', { status: 200 })
  processed.add(messageId)
  if (processed.size > 5000) {
    const first = processed.values().next().value
    if (first) processed.delete(first)
  }

  const remoteJid = key.remoteJid as string
  // Ignora grupos
  if (remoteJid.includes('@g.us')) return new Response('group', { status: 200 })

  // Extrai texto da mensagem
  const msg = data.message as Record<string, unknown> | null
  const text =
    (msg?.conversation as string | undefined) ||
    (msg?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined ||
    ''

  if (!text?.trim()) return new Response('no text', { status: 200 })

  // Carrega config do escritório
  let cfg: EvolutionConfig | null = null
  let aiEnabled = false

  try {
    const row = await prisma.escritorio.findFirst({
      select: {
        evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true,
        whatsappAiEnabled: true, whatsappAiFeature: true,
      },
    })
    if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
      const rawKey = row.evolutionApiKey
      cfg = {
        baseUrl: row.evolutionApiUrl,
        apiKey: rawKey ? (isEncrypted(rawKey) ? decrypt(rawKey) : rawKey) : (process.env.EVOLUTION_API_KEY ?? ''),
        instance: row.evolutionInstance,
      }
    }
    aiEnabled = row?.whatsappAiEnabled ?? false
  } catch {
    // DB indisponível
  }

  if (!cfg || !aiEnabled) return new Response('ai disabled', { status: 200 })

  // Chama a IA
  try {
    const result = await askAI({
      pergunta: text.trim(),
      context: { escopo: 'global' },
      feature: 'whatsapp',
      maxTokens: 512,
    })

    await sendText(cfg, remoteJid, result.resposta)
  } catch (err) {
    console.error('[whatsapp/webhook] erro ao responder:', err)
    // Não retorna erro para o Evolution API — seria retentado infinitamente
  }

  return new Response('ok', { status: 200 })
}

// GET usado pelo Evolution API para verificar o webhook
export async function GET() {
  return new Response('ok', { status: 200 })
}
