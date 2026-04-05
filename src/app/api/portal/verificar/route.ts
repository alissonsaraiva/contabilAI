/**
 * GET /api/portal/verificar?token=xxx
 *
 * Route Handler — único lugar onde cookies podem ser setados server-side no Next.js 15+.
 * A RSC page (/portal/verificar) foi convertida para redirecionar aqui.
 *
 * Valida o magic-link, cria JWT de sessão do portal e redireciona para o dashboard.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PORTAL_COOKIE_NAME } from '@/lib/auth-portal'
import { encode } from '@auth/core/jwt'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  // req.url resolves to internal address (0.0.0.0:3000) when behind Traefik.
  // Use the forwarded host header or the configured portal URL.
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
  const forwardedHost = req.headers.get('x-forwarded-host')
  const baseUrl =
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null) ??
    process.env.NEXT_PUBLIC_PORTAL_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    req.nextUrl.origin

  const loginError = (erro: string) =>
    NextResponse.redirect(new URL(`/portal/login?erro=${erro}`, baseUrl))

  if (!token) return loginError('token_invalido')

  const hash = crypto.createHash('sha256').update(token).digest('hex')

  const record = await prisma.portalToken.findUnique({
    where: { token: hash },
    include: {
      cliente: { select: { id: true, nome: true, email: true, status: true } },
      socio: { select: { id: true, nome: true, email: true, portalAccess: true } },
    },
  })

  if (!record) return loginError('token_invalido')
  if (record.usedAt) return loginError('token_invalido')
  if (record.expiresAt < new Date()) return loginError('token_expirado')

  const maxAge = 30 * 24 * 60 * 60 // 30 dias

  async function buildSessionResponse(payload: {
    id: string; name: string; email: string
    tipo: 'cliente' | 'socio'; empresaId: string
  }) {
    const jwt = await encode({
      token: {
        sub: payload.id,
        id: payload.id,
        name: payload.name,
        email: payload.email,
        tipo: payload.tipo,
        empresaId: payload.empresaId,
      },
      secret: process.env.AUTH_SECRET!,
      salt: PORTAL_COOKIE_NAME,
      maxAge,
    })

    const res = NextResponse.redirect(new URL('/portal/dashboard', baseUrl))
    res.cookies.set(PORTAL_COOKIE_NAME, jwt, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge,
    })
    return res
  }

  if (record.cliente) {
    const { status } = record.cliente
    if (status !== 'ativo' && status !== 'inadimplente') return loginError('conta_inativa')

    const res = await buildSessionResponse({
      id: record.cliente.id,
      name: record.cliente.nome,
      email: record.cliente.email ?? '',
      tipo: 'cliente',
      empresaId: record.empresaId!,
    })

    // Marca o token como usado apenas APÓS o JWT ter sido criado com sucesso.
    // Se encode() falhar antes deste ponto, o token permanece válido — o usuário pode tentar de novo.
    await prisma.portalToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })

    return res
  }

  if (record.socio) {
    if (!record.socio.portalAccess) return loginError('acesso_negado')
    if (!record.socio.email) return loginError('token_invalido')

    const res = await buildSessionResponse({
      id: record.socio.id,
      name: record.socio.nome,
      email: record.socio.email!,
      tipo: 'socio',
      empresaId: record.empresaId!,
    })

    // Mesmo critério: só consome o token após sessão criada com sucesso.
    await prisma.portalToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })

    return res
  }

  return loginError('token_invalido')
}
