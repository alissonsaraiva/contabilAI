/**
 * Middleware de rotas — roda no edge runtime.
 *
 * CRM  → cookie "authjs.session-token"   (NextAuth padrão, src/lib/auth.ts)
 * Portal → cookie "portal.session-token"  (NextAuth separado, src/lib/auth-portal.ts)
 *
 * Em produção, cada subdomínio serve apenas seu contexto:
 *   crm.avos.digital    → /crm/* e /login
 *   portal.avos.digital → /portal/*
 *   avos.digital        → /onboarding/* e raiz
 */
import { type NextRequest, NextResponse } from 'next/server'
import { decode } from '@auth/core/jwt'

const isProduction = process.env.NODE_ENV === 'production'
const PREFIX       = isProduction ? '__Secure-' : ''

const CRM_COOKIE    = `${PREFIX}authjs.session-token`
const PORTAL_COOKIE = `${PREFIX}portal.session-token`

// AUTH_URL é server-side (disponível em runtime no Edge); NEXT_PUBLIC_* são baked no build
// e ficam undefined se não passados como build arg — por isso usar AUTH_URL aqui
const CRM_URL    = process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_CRM_URL ?? ''
const PORTAL_URL = CRM_URL.replace('://crm.', '://portal.') || (process.env.NEXT_PUBLIC_PORTAL_URL ?? '')
const ROOT_URL   = process.env.NEXT_PUBLIC_APP_URL ?? ''

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
  const path     = req.nextUrl.pathname
  const hostname = req.headers.get('host') ?? ''

  // ── Isolamento por subdomínio (produção apenas) ─────────────────────────
  if (isProduction && CRM_URL) {
    const isCrm    = hostname.startsWith('crm.')
    const isPortal = hostname.startsWith('portal.')

    if (isCrm) {
      // crm.* serve /crm/*, /login, /onboarding/* e /api/*
      if (path.startsWith('/portal')) return NextResponse.redirect(new URL(PORTAL_URL + '/portal/login'))
      if (path === '/')               return NextResponse.redirect(new URL(CRM_URL + '/login'))
    }

    if (isPortal) {
      // portal.* serve /portal/* e /api/*
      if (path.startsWith('/crm'))        return NextResponse.redirect(new URL(CRM_URL + '/login'))
      if (path.startsWith('/onboarding')) return NextResponse.redirect(new URL(CRM_URL + path))
      if (path === '/' || path === '/login') return NextResponse.redirect(new URL(PORTAL_URL + '/portal/login'))
    }

    if (!isCrm && !isPortal) {
      // avos.digital (site) — bloqueia rotas de app
      if (path.startsWith('/crm'))        return NextResponse.redirect(new URL(CRM_URL + '/login'))
      if (path.startsWith('/portal'))     return NextResponse.redirect(new URL(PORTAL_URL + '/portal/login'))
      if (path.startsWith('/onboarding')) return NextResponse.redirect(new URL(CRM_URL + path))
    }
  }

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

  // ── Portal: clientes e sócios ───────────────────────────────────────────
  if (path.startsWith('/portal')) {
    // Páginas públicas do portal
    if (path === '/portal/login' || path.startsWith('/portal/verificar')) {
      const token = await getToken(req, PORTAL_COOKIE)
      const tipo  = token?.tipo as string | undefined
      if (tipo === 'cliente' || tipo === 'socio') {
        return NextResponse.redirect(new URL('/portal/dashboard', req.url))
      }
      return NextResponse.next()
    }
    const token = await getToken(req, PORTAL_COOKIE)
    if (!token) return NextResponse.redirect(new URL('/portal/login', req.url))
    const tipo = token.tipo as string
    if (tipo !== 'cliente' && tipo !== 'socio') {
      return NextResponse.redirect(new URL('/portal/login', req.url))
    }
  }

  // ── /login: redireciona CRM autenticado direto pro dashboard ───────────
  if (path === '/login') {
    const token = await getToken(req, CRM_COOKIE)
    if (token?.tipo === 'contador' || token?.tipo === 'admin') {
      return NextResponse.redirect(new URL('/crm/dashboard', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|_next/webpack-hmr).*)'],
}
