/**
 * POST /api/portal/logout
 *
 * Encerra a sessão do portal: apaga o cookie JWT e redireciona para /portal/login.
 * Como o token é stateless (JWT), não há revogação server-side — basta remover o cookie.
 */
import { NextResponse } from 'next/server'
import { PORTAL_COOKIE_NAME } from '@/lib/auth-portal'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(PORTAL_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0, // força expiração imediata
  })
  return res
}

export async function GET() {
  const res = NextResponse.redirect(new URL('/portal/login', process.env.AUTH_URL ?? 'http://localhost:3000'))
  res.cookies.set(PORTAL_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  })
  return res
}
