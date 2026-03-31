import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import {
  createInstance, connectInstance, getConnectionState,
  logoutInstance, deleteInstance, setWebhook, sendText,
  type EvolutionConfig,
} from '@/lib/evolution'

async function getConfig(): Promise<EvolutionConfig | null> {
  const row = await prisma.escritorio.findFirst({
    select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
  })
  if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) return null

  const rawKey = row.evolutionApiKey
  const apiKey = rawKey
    ? isEncrypted(rawKey) ? decrypt(rawKey) : rawKey
    : (process.env.EVOLUTION_API_KEY ?? '')

  return {
    baseUrl: row.evolutionApiUrl,
    apiKey,
    instance: row.evolutionInstance,
  }
}

function isAdmin(session: { user?: unknown } | null): boolean {
  const tipo = (session?.user as any)?.tipo
  return !!session && (tipo === 'admin' || tipo === 'contador')
}

export async function GET(req: Request) {
  const session = await auth() as { user?: unknown } | null
  if (!isAdmin(session)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') ?? 'state'

  const cfg = await getConfig()
  if (!cfg) return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 400 })

  try {
    if (action === 'connect') {
      const data = await connectInstance(cfg)
      return NextResponse.json(data)
    }
    // default: state
    const data = await getConnectionState(cfg)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  const session = await auth() as { user?: unknown } | null
  if (!isAdmin(session)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { action, webhookUrl, testNumber } = await req.json() as { action: string; webhookUrl?: string; testNumber?: string }

  const cfg = await getConfig()
  if (!cfg) return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 400 })

  try {
    switch (action) {
      case 'create':   return NextResponse.json(await createInstance(cfg))
      case 'logout':   return NextResponse.json(await logoutInstance(cfg))
      case 'delete':   return NextResponse.json(await deleteInstance(cfg))
      case 'webhook':
        if (!webhookUrl) return NextResponse.json({ error: 'webhookUrl obrigatório' }, { status: 400 })
        return NextResponse.json(await setWebhook(cfg, webhookUrl))
      case 'sendTest': {
        if (!testNumber) return NextResponse.json({ error: 'testNumber obrigatório' }, { status: 400 })
        const number = testNumber.replace(/\D/g, '')
        const result = await sendText(cfg, `${number}@s.whatsapp.net`, '✅ Teste de conexão WhatsApp — AVOS funcionando corretamente!')
        return NextResponse.json(result)
      }
      default:
        return NextResponse.json({ error: 'action inválida' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
