import { prisma } from '@/lib/prisma'
import { PORTAL_COOKIE_NAME } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { encode } from '@auth/core/jwt'
import crypto from 'crypto'

type Props = { searchParams: Promise<{ token?: string }> }

/**
 * Verificação de magic-link — 100% server-side.
 *
 * IMPORTANTE: NÃO use signInPortal() aqui.
 * No next-auth v5 beta com basePath customizado + Credentials provider,
 * o signIn() de RSC faz fetch interno para AUTH_URL/api/portal/auth/callback/portal-token
 * mas o Set-Cookie da resposta interna NÃO é propagado ao browser — a sessão é criada
 * mas o cookie nunca chega, e o proxy redireciona para /portal/login.
 *
 * Solução: encode JWT manualmente com @auth/core/jwt (mesmo secret + salt do proxy)
 * e setar o cookie via cookies() do Next.js, que escreve direto no response header.
 */
export default async function PortalVerificarPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) redirect('/portal/login?erro=token_invalido')

  const hash = crypto.createHash('sha256').update(token!).digest('hex')

  const record = await prisma.portalToken.findUnique({
    where:   { token: hash },
    include: {
      cliente: { select: { id: true, nome: true, email: true, status: true } },
      socio:   { select: { id: true, nome: true, email: true, portalAccess: true } },
    },
  })

  if (!record)                         redirect('/portal/login?erro=token_invalido')
  if (record!.usedAt)                  redirect('/portal/login?erro=token_invalido')
  if (record!.expiresAt < new Date())  redirect('/portal/login?erro=token_expirado')

  const r = record!

  async function criarSessao(payload: {
    id: string
    name: string
    email: string
    tipo: 'cliente' | 'socio'
    empresaId: string
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

    const cookieStore = await cookies()
    cookieStore.set(PORTAL_COOKIE_NAME, jwt, {
      httpOnly: true,
      sameSite: 'lax',
      path:     '/',
      secure:   process.env.NODE_ENV === 'production',
      maxAge,
    })
  }

  if (r.cliente) {
    const { status } = r.cliente
    if (status !== 'ativo' && status !== 'inadimplente') {
      redirect('/portal/login?erro=conta_inativa')
    }

    await prisma.portalToken.update({ where: { id: r.id }, data: { usedAt: new Date() } })

    await criarSessao({
      id:        r.cliente.id,
      name:      r.cliente.nome,
      email:     r.cliente.email ?? '',
      tipo:      'cliente',
      empresaId: r.empresaId!,
    })

    redirect('/portal/dashboard')
  }

  if (r.socio) {
    if (!r.socio.portalAccess) redirect('/portal/login?erro=acesso_negado')
    if (!r.socio.email)        redirect('/portal/login?erro=token_invalido')

    await prisma.portalToken.update({ where: { id: r.id }, data: { usedAt: new Date() } })

    await criarSessao({
      id:        r.socio.id,
      name:      r.socio.nome,
      email:     r.socio.email!,
      tipo:      'socio',
      empresaId: r.empresaId!,
    })

    redirect('/portal/dashboard')
  }

  // Sem cliente nem sócio no record — não deveria acontecer
  redirect('/portal/login?erro=token_invalido')
}
