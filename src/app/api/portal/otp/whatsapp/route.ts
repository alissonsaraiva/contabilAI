/**
 * POST /api/portal/otp/whatsapp
 * Body: { email: string }
 *
 * Gera um OTP de 6 dígitos e envia via WhatsApp para o número cadastrado do cliente.
 * Usado no login via PWA onde magic links não funcionam corretamente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { criarTokenPortal, criarTokenPortalSocio } from '@/lib/portal/tokens'
import { sendText, type EvolutionConfig } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'

function buildRemoteJid(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

async function getEvolutionConfig(): Promise<EvolutionConfig | null> {
  const row = await prisma.escritorio.findFirst({
    select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
  })
  if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) return null
  const rawKey = row.evolutionApiKey
  return {
    baseUrl:  row.evolutionApiUrl,
    apiKey:   rawKey ? (isEncrypted(rawKey) ? decrypt(rawKey) : rawKey) : (process.env.EVOLUTION_API_KEY ?? ''),
    instance: row.evolutionInstance,
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null

  if (!email) {
    return NextResponse.json({ error: 'email_invalido' }, { status: 400 })
  }

  // Tenta titular
  const cliente = await prisma.cliente.findUnique({
    where:  { email },
    select: { id: true, nome: true, status: true, empresaId: true, whatsapp: true, telefone: true },
  })

  if (cliente) {
    if (cliente.status === 'suspenso')  return NextResponse.json({ error: 'conta_suspensa' },  { status: 403 })
    if (cliente.status === 'cancelado') return NextResponse.json({ error: 'conta_cancelada' }, { status: 403 })
    if (!cliente.empresaId)             return NextResponse.json({ error: 'empresa_nao_vinculada' }, { status: 400 })

    const phone = cliente.whatsapp || cliente.telefone
    if (!phone) return NextResponse.json({ error: 'whatsapp_nao_cadastrado' }, { status: 400 })

    const cfg = await getEvolutionConfig()
    if (!cfg) return NextResponse.json({ error: 'whatsapp_indisponivel' }, { status: 503 })

    const { otp } = await criarTokenPortal(cliente.id, cliente.empresaId, 30 * 60 * 1000)

    const result = await sendText(cfg, buildRemoteJid(phone),
      `🔐 *Código de acesso ao Portal*\n\n*${otp}*\n\nVálido por 10 minutos. Não compartilhe com ninguém.`,
    )

    if (!result.ok) return NextResponse.json({ error: 'whatsapp_falhou' }, { status: 503 })
    return NextResponse.json({ ok: true })
  }

  // Tenta sócio
  const socio = await prisma.socio.findFirst({
    where:  { email, portalAccess: true },
    select: { id: true, nome: true, empresaId: true, whatsapp: true, telefone: true },
  })

  if (socio) {
    const phone = socio.whatsapp || socio.telefone
    if (!phone) return NextResponse.json({ error: 'whatsapp_nao_cadastrado' }, { status: 400 })

    const cfg = await getEvolutionConfig()
    if (!cfg) return NextResponse.json({ error: 'whatsapp_indisponivel' }, { status: 503 })

    const { otp } = await criarTokenPortalSocio(socio.id, socio.empresaId, 30 * 60 * 1000)

    const result = await sendText(cfg, buildRemoteJid(phone),
      `🔐 *Código de acesso ao Portal*\n\n*${otp}*\n\nVálido por 10 minutos. Não compartilhe com ninguém.`,
    )

    if (!result.ok) return NextResponse.json({ error: 'whatsapp_falhou' }, { status: 503 })
    return NextResponse.json({ ok: true })
  }

  // Genérico para não revelar se email existe
  return NextResponse.json({ error: 'email_nao_cadastrado' }, { status: 404 })
}
