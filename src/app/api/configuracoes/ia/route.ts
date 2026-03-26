import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { encrypt, maskKey, isEncrypted } from '@/lib/crypto'

// Campos que são chaves secretas — encriptados no banco, mascarados na resposta
const SECRET_FIELDS = ['anthropicApiKey', 'voyageApiKey', 'openaiApiKey', 'googleApiKey', 'evolutionApiKey', 'groqApiKey'] as const
type SecretField = typeof SECRET_FIELDS[number]

// GET — retorna config com chaves mascaradas
export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const row = await prisma.escritorio.findFirst({
    select: {
      aiProvider: true,
      anthropicApiKey: true,
      voyageApiKey: true,
      openaiApiKey: true,
      openaiBaseUrl: true,
      openaiModel: true,
      googleApiKey: true,
      groqApiKey: true,
      aiModelOnboarding: true,
      aiModelCrm: true,
      aiModelPortal: true,
      aiModelWhatsapp: true,
      aiProviderOnboarding: true,
      aiProviderCrm: true,
      aiProviderPortal: true,
      aiProviderWhatsapp: true,
      systemPromptOnboarding: true,
      systemPromptCrm: true,
      systemPromptPortal: true,
      // WhatsApp fields also returned (used by whatsapp page)
      systemPromptWhatsapp: true,
      whatsappAiEnabled: true,
      whatsappAiFeature: true,
      evolutionApiUrl: true,
      evolutionApiKey: true,
      evolutionInstance: true,
    },
  })

  // Mascara as chaves — nunca expõe valor real
  const masked: Record<string, string | null | boolean> = { ...row }
  for (const field of SECRET_FIELDS) {
    const val = row?.[field]
    masked[field] = val ? maskKey(val) : null
    masked[`${field}Configured`] = !!val
  }

  return NextResponse.json(masked)
}

// PUT — salva config, encriptando chaves secretas
export async function PUT(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json() as Record<string, string | null>

  const data: Record<string, string | null> = {}

  // Campos de texto simples
  const plainFields = [
    'aiProvider', 'openaiBaseUrl', 'openaiModel',
    'aiModelOnboarding', 'aiModelCrm', 'aiModelPortal', 'aiModelWhatsapp',
    'aiProviderOnboarding', 'aiProviderCrm', 'aiProviderPortal', 'aiProviderWhatsapp',
    'systemPromptOnboarding', 'systemPromptCrm', 'systemPromptPortal',
    // WhatsApp (saved from both IA and WhatsApp pages)
    'systemPromptWhatsapp', 'whatsappAiEnabled', 'whatsappAiFeature',
    'evolutionApiUrl', 'evolutionInstance',
  ]
  for (const field of plainFields) {
    if (field in body) data[field] = body[field] ?? null
  }

  // Chaves secretas — encripta apenas se o valor mudou (não é máscara)
  for (const field of SECRET_FIELDS) {
    if (!(field in body)) continue
    const val = body[field]
    // String vazia = campo não preenchido = não altera o valor existente no banco
    if (!val) continue
    // Se o front mandou a máscara de volta (começa com •), ignora — não alterou
    if (val.startsWith('•')) continue

    // Verifica se ENCRYPTION_KEY está configurada
    if (!process.env.ENCRYPTION_KEY) {
      // Em dev sem ENCRYPTION_KEY, salva sem encriptar (com aviso no log)
      console.warn(`[ai-config] ENCRYPTION_KEY não configurada — salvando ${field} sem encriptação`)
      data[field] = val
    } else {
      data[field] = encrypt(val)
    }
  }

  await prisma.escritorio.upsert({
    where: { id: 'singleton' },
    update: { ...data, atualizadoEm: new Date() },
    create: { id: 'singleton', ...data },
  })

  return NextResponse.json({ ok: true })
}

// POST — testa todas as chaves configuradas em paralelo
export async function POST() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { getAiConfig } = await import('@/lib/ai/config')
  const config = await getAiConfig()

  type R = { ok: boolean; label?: string; error?: string }

  async function testAnthropic(): Promise<R> {
    if (!config.anthropicApiKey) return { ok: false, error: 'Não configurada' }
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: config.anthropicApiKey })
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ok?' }],
    })
    const model = res.model ?? 'claude-haiku-4-5-20251001'
    return { ok: true, label: model }
  }

  async function testVoyage(): Promise<R> {
    if (!config.voyageApiKey) return { ok: false, error: 'Não configurada' }
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.voyageApiKey}` },
      body: JSON.stringify({ input: ['test'], model: 'voyage-3-lite' }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body}`)
    }
    return { ok: true, label: 'voyage-3-lite' }
  }

  async function testGroq(): Promise<R> {
    if (!config.groqApiKey) return { ok: false, error: 'Não configurada' }
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groqApiKey}` },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'ok?' }], max_tokens: 5 }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body}`)
    }
    return { ok: true, label: 'whisper + llama-3.1' }
  }

  async function testOpenAI(): Promise<R> {
    if (!config.openaiApiKey) return { ok: false, error: 'Não configurada' }
    const baseUrl = config.openaiBaseUrl?.trim() || 'https://api.openai.com/v1'
    const model = config.openaiModel ?? 'gpt-4o-mini'
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ok?' }], max_tokens: 5 }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body}`)
    }
    return { ok: true, label: model }
  }

  async function testGoogle(): Promise<R> {
    if (!config.googleApiKey) return { ok: false, error: 'Não configurada' }
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.googleApiKey}` },
      body: JSON.stringify({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'ok?' }], max_tokens: 5 }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body}`)
    }
    return { ok: true, label: 'gemini-2.5-flash' }
  }

  const wrap = async (fn: () => Promise<R>): Promise<R> => {
    try { return await fn() }
    catch (e) { return { ok: false, error: (e as Error).message } }
  }

  const [anthropic, voyage, groq, openai, google] = await Promise.all([
    wrap(testAnthropic),
    wrap(testVoyage),
    wrap(testGroq),
    wrap(testOpenAI),
    wrap(testGoogle),
  ])

  return NextResponse.json({ anthropic, voyage, groq, openai, google })
}
