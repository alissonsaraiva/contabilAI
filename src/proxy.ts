import { auth } from '@/lib/auth-edge'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const path = req.nextUrl.pathname
  const user = req.auth?.user
  const tipo = (user as any)?.tipo

  if (path.startsWith('/crm')) {
    if (!user) return NextResponse.redirect(new URL('/login', req.url))
    if (tipo !== 'contador' && tipo !== 'admin') {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    const precisaTrocarSenha = (user as any)?.precisaTrocarSenha
    if (precisaTrocarSenha && path !== '/crm/trocar-senha') {
      return NextResponse.redirect(new URL('/crm/trocar-senha', req.url))
    }
  }

  if (path.startsWith('/portal')) {
    if (!user) return NextResponse.redirect(new URL('/login', req.url))
  }

  if (path === '/login' && user) {
    if (tipo === 'contador' || tipo === 'admin') {
      return NextResponse.redirect(new URL('/crm/dashboard', req.url))
    }
    return NextResponse.redirect(new URL('/portal/dashboard', req.url))
  }
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|_next/webpack-hmr).*)'],
}
