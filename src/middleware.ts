import { auth } from '@/lib/auth-edge'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const session = req.auth
  const url = req.nextUrl

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const precisaTrocarSenha = (session?.user as any)?.precisaTrocarSenha
  const isOnTrocarSenha = url.pathname === '/crm/trocar-senha'

  if (precisaTrocarSenha && !isOnTrocarSenha) {
    return NextResponse.redirect(new URL('/crm/trocar-senha', req.url))
  }
})

export const config = {
  matcher: ['/crm/:path*'],
}
