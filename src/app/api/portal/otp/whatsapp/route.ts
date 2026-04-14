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
import { getEmpresaPrincipal } from '@/lib/portal-session'
import { sendText, type EvolutionConfig } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit'

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
  // Rate limit: 3 envios por IP a cada 5 minutos (evita spam de mensagens WA)
  const ip = getClientIp(req)
  const rl = rateLimit(`otp-whatsapp:${ip}`, 3, 5 * 60_000)
  if (!rl.allowed) return tooManyRequests(rl.retryAfterMs)

  const body = await req.json().catch(() => null)
  const email    = typeof body?.email    === 'string' ? body.email.trim().toLowerCase() : null
  const telefone = typeof body?.telefone === 'string' ? body.telefone.replace(/\D/g, '') : null

  if (!email && (!telefone || telefone.length < 8)) {
    return NextResponse.json({ error: 'parametros_invalidos' }, { status: 400 })
  }

  async function enviarOtpCliente(cliente: {
    id: string; nome: string; status: string; empresaId: string | null; whatsapp: string | null; telefone: string | null
  }): Promise<NextResponse> {
    if (cliente.status === 'suspenso')  return NextResponse.json({ error: 'conta_suspensa' },  { status: 403 })
    if (cliente.status === 'cancelado') return NextResponse.json({ error: 'conta_cancelada' }, { status: 403 })
    if (cliente.status !== 'ativo' && cliente.status !== 'inadimplente') return NextResponse.json({ error: 'conta_inativa' }, { status: 403 })
    const empresaId = await getEmpresaPrincipal(cliente.id)
    if (!empresaId)                     return NextResponse.json({ error: 'empresa_nao_vinculada' }, { status: 400 })

    const phone = cliente.whatsapp
    if (!phone) return NextResponse.json({ error: 'whatsapp_nao_cadastrado' }, { status: 400 })

    const cfg = await getEvolutionConfig()
    if (!cfg) return NextResponse.json({ error: 'whatsapp_indisponivel' }, { status: 503 })

    const { otp } = await criarTokenPortal(cliente.id, empresaId, 30 * 60 * 1000)
    const result = await sendText(cfg, buildRemoteJid(phone),
      `🔐 *Código de acesso ao Portal*\n\n*${otp}*\n\nVálido por 10 minutos. Não compartilhe com ninguém.`,
    )
    if (!result.ok) return NextResponse.json({ error: 'whatsapp_falhou' }, { status: 503 })
    return NextResponse.json({ ok: true })
  }

  async function enviarOtpSocio(socio: {
    id: string; nome: string; empresaId: string; whatsapp: string | null; telefone: string | null
  }): Promise<NextResponse> {
    const phone = socio.whatsapp
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

  const clienteSelect = { id: true, nome: true, status: true, empresaId: true, whatsapp: true, telefone: true } as const
  const socioSelect   = { id: true, nome: true, empresaId: true, whatsapp: true, telefone: true } as const

  // ── Busca por telefone ───────────────────────────────────────────────────────
  // Usa regexp_replace para ignorar formatação (parênteses, hífens, espaços) no banco
  if (telefone) {
    const clienteRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM clientes
      WHERE regexp_replace(COALESCE(whatsapp, ''), '[^0-9]', '', 'g') = ${telefone}
         OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ${telefone}
      LIMIT 1
    `
    if (clienteRows.length > 0) {
      const clientePorTel = await prisma.cliente.findUnique({ where: { id: clienteRows[0]!.id }, select: clienteSelect })
      if (clientePorTel) return enviarOtpCliente(clientePorTel)
    }

    const socioRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM socios
      WHERE "portalAccess" = true
        AND (
          regexp_replace(COALESCE(whatsapp, ''), '[^0-9]', '', 'g') = ${telefone}
          OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ${telefone}
        )
      LIMIT 1
    `
    if (socioRows.length > 0) {
      const socioPorTel = await prisma.socio.findUnique({ where: { id: socioRows[0]!.id }, select: socioSelect })
      if (socioPorTel) return enviarOtpSocio(socioPorTel)
    }

    return NextResponse.json({ error: 'whatsapp_nao_cadastrado' }, { status: 404 })
  }

  // ── Busca por email (compatibilidade) ────────────────────────────────────────
  const cliente = await prisma.cliente.findUnique({ where: { email: email! }, select: clienteSelect })
  if (cliente) return enviarOtpCliente(cliente)

  const socio = await prisma.socio.findFirst({ where: { email: email!, portalAccess: true }, select: socioSelect })
  if (socio) return enviarOtpSocio(socio)

  return NextResponse.json({ error: 'email_nao_cadastrado' }, { status: 404 })
}
