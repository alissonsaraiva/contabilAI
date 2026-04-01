/**
 * POST /api/portal/otp/verificar
 * Body: { email: string; otp: string }
 *
 * Valida o código OTP de 6 dígitos, cria JWT de sessão do portal e retorna { ok: true }
 * com o cookie de sessão setado no header da resposta.
 *
 * Fluxo: login PWA/WhatsApp — sem redirecionamento, o cliente redireciona via JS.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PORTAL_COOKIE_NAME } from '@/lib/auth-portal'
import { encode } from '@auth/core/jwt'
import crypto from 'crypto'
import { rateLimit, getClientIp, tooManyRequests } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit: 5 tentativas por IP por 15 minutos (brute force de OTP)
  const ip = getClientIp(req)
  const rl = rateLimit(`otp-verify:${ip}`, 5, 15 * 60_000)
  if (!rl.allowed) return tooManyRequests(rl.retryAfterMs)

  const body = await req.json().catch(() => null)
  const email    = typeof body?.email    === 'string' ? body.email.trim().toLowerCase() : null
  const telefone = typeof body?.telefone === 'string' ? body.telefone.replace(/\D/g, '') : null
  const otp      = typeof body?.otp      === 'string' ? body.otp.trim() : null

  if ((!email && !telefone) || !otp) {
    return NextResponse.json({ error: 'parametros_invalidos' }, { status: 400 })
  }

  // Validação básica quando email fornecido
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'codigo_invalido' }, { status: 400 })
  }

  const otpHash = crypto.createHash('sha256').update(otp).digest('hex')

  const clienteSelect = { id: true, nome: true, email: true, status: true, empresaId: true } as const
  const socioSelect   = { id: true, nome: true, email: true, empresaId: true } as const

  // ── Resolve cliente ──────────────────────────────────────────────────────────
  let clienteId: string | null = null
  if (!email && telefone) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM clientes
      WHERE regexp_replace(COALESCE(whatsapp, ''), '[^0-9]', '', 'g') = ${telefone}
         OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ${telefone}
      LIMIT 1
    `
    clienteId = rows[0]?.id ?? null
  }

  const cliente = email
    ? await prisma.cliente.findUnique({ where: { email }, select: clienteSelect })
    : clienteId
      ? await prisma.cliente.findUnique({ where: { id: clienteId }, select: clienteSelect })
      : null

  if (cliente) {
    if (cliente.status !== 'ativo' && cliente.status !== 'inadimplente') {
      return NextResponse.json({ error: 'conta_inativa' }, { status: 403 })
    }

    const record = await prisma.portalToken.findFirst({
      where:   { clienteId: cliente.id, usedAt: null },
      orderBy: { criadoEm: 'desc' },
    })

    const otpError = validarOtp(record, otpHash)
    if (otpError) return NextResponse.json({ error: otpError }, { status: 400 })

    await prisma.portalToken.update({ where: { id: record!.id }, data: { usedAt: new Date() } })

    return buildSessionResponse({
      id:        cliente.id,
      name:      cliente.nome,
      email:     cliente.email ?? '',
      tipo:      'cliente',
      empresaId: cliente.empresaId!,
    })
  }

  // ── Resolve sócio ────────────────────────────────────────────────────────────
  let socioId: string | null = null
  if (!email && telefone) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM socios
      WHERE "portalAccess" = true
        AND (
          regexp_replace(COALESCE(whatsapp, ''), '[^0-9]', '', 'g') = ${telefone}
          OR regexp_replace(COALESCE(telefone, ''), '[^0-9]', '', 'g') = ${telefone}
        )
      LIMIT 1
    `
    socioId = rows[0]?.id ?? null
  }

  const socio = email
    ? await prisma.socio.findFirst({ where: { email, portalAccess: true }, select: socioSelect })
    : socioId
      ? await prisma.socio.findUnique({ where: { id: socioId }, select: socioSelect })
      : null

  if (socio) {
    if (!socio.email) return NextResponse.json({ error: 'codigo_invalido' }, { status: 400 })

    const record = await prisma.portalToken.findFirst({
      where:   { socioId: socio.id, usedAt: null },
      orderBy: { criadoEm: 'desc' },
    })

    const otpError = validarOtp(record, otpHash)
    if (otpError) return NextResponse.json({ error: otpError }, { status: 400 })

    await prisma.portalToken.update({ where: { id: record!.id }, data: { usedAt: new Date() } })

    return buildSessionResponse({
      id:        socio.id,
      name:      socio.nome,
      email:     socio.email,
      tipo:      'socio',
      empresaId: socio.empresaId,
    })
  }

  return NextResponse.json({ error: 'codigo_invalido' }, { status: 400 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validarOtp(record: any, otpHash: string): string | null {
  if (!record || !record.otp)              return 'codigo_invalido'
  if (record.usedAt)                       return 'codigo_invalido'
  if (record.otp !== otpHash)              return 'codigo_invalido'
  if (record.otpExpiresAt && record.otpExpiresAt < new Date()) return 'codigo_expirado'
  return null
}

async function buildSessionResponse(payload: {
  id: string; name: string; email: string
  tipo: 'cliente' | 'socio'; empresaId: string
}) {
  const maxAge = 30 * 24 * 60 * 60 // 30 dias

  const jwt = await encode({
    token: {
      sub:       payload.id,
      id:        payload.id,
      name:      payload.name,
      email:     payload.email,
      tipo:      payload.tipo,
      empresaId: payload.empresaId,
    },
    secret: process.env.AUTH_SECRET!,
    salt:   PORTAL_COOKIE_NAME,
    maxAge,
  })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
    secure:   process.env.NODE_ENV === 'production',
    maxAge,
  })
  return res
}
