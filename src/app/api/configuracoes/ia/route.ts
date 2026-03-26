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

// POST /test — testa a conexão com o provider configurado
export async function POST(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { askAI } = await import('@/lib/ai/ask')

  try {
    const result = await askAI({
      pergunta: 'Responda apenas: "Conexão OK"',
      context: { escopo: 'global' },
      maxTokens: 20,
    })
    return NextResponse.json({ ok: true, provider: result.provider, model: result.model })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 })
  }
}
