/**
 * Middleware de rotas — roda no edge runtime.
 *
 * CRM  → cookie "authjs.session-token"   (NextAuth padrão, src/lib/auth.ts)
 * Portal → cookie "portal.session-token"  (NextAuth separado, src/lib/auth-portal.ts)
 *
 * As duas sessões são completamente independentes: fazer login em uma
 * não afeta nem derruba a sessão da outra.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { decode } from '@auth/core/jwt'

const isProduction = process.env.NODE_ENV === 'production'
const PREFIX       = isProduction ? '__Secure-' : ''

const CRM_COOKIE    = `${PREFIX}authjs.session-token`
const PORTAL_COOKIE = `${PREFIX}portal.session-token`

async function getToken(req: NextRequest, cookieName: string) {
  const value = req.cookies.get(cookieName)?.value
  if (!value) return null
  try {
    return await decode({
      token:  value,
      secret: process.env.AUTH_SECRET!,
      salt:   cookieName,
    })
  } catch {
    return null
  }
}

export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // ── CRM: só contador / admin ────────────────────────────────────────────
  if (path.startsWith('/crm')) {
    const token = await getToken(req, CRM_COOKIE)
    if (!token) return NextResponse.redirect(new URL('/login', req.url))
    const tipo = token.tipo as string
    if (tipo !== 'contador' && tipo !== 'admin') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    if (token.precisaTrocarSenha && path !== '/crm/trocar-senha') {
      return NextResponse.redirect(new URL('/crm/trocar-senha', req.url))
    }
  }

  // ── Portal: só clientes ─────────────────────────────────────────────────
  if (path.startsWith('/portal')) {
    // Páginas públicas do portal
    if (path === '/portal/login' || path.startsWith('/portal/verificar')) {
      const token = await getToken(req, PORTAL_COOKIE)
      if (token?.tipo === 'cliente') {
        return NextResponse.redirect(new URL('/portal/dashboard', req.url))
      }
      return NextResponse.next()
    }
    const token = await getToken(req, PORTAL_COOKIE)
    if (!token) return NextResponse.redirect(new URL('/portal/login', req.url))
    if (token.tipo !== 'cliente') return NextResponse.redirect(new URL('/portal/login', req.url))
  }

  // ── /login: redireciona CRM autenticado direto pro dashboard ───────────
  if (path === '/login') {
    const token = await getToken(req, CRM_COOKIE)
    if (token?.tipo === 'contador' || token?.tipo === 'admin') {
      return NextResponse.redirect(new URL('/crm/dashboard', req.url))
    }
    // Clientes NÃO são redirecionados de /login para o portal —
    // /login é o login do CRM, cada um tem sua própria tela de login.
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|_next/webpack-hmr).*)'],
}
