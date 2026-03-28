import { prisma } from '@/lib/prisma'
import { signInPortal } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import crypto from 'crypto'

type Props = { searchParams: Promise<{ token?: string }> }

/**
 * Verificação de magic-link — 100% server-side.
 * Valida o token, cria a sessão do portal via signInPortal (RSC)
 * e redireciona para /portal/dashboard.
 *
 * Por ser RSC, a sessão é criada server-side (cookie definido no header da resposta),
 * evitando o problema do client-side signIn com basePath customizado no next-auth v5 beta.
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

  if (r.cliente) {
    const { status } = r.cliente
    if (status !== 'ativo' && status !== 'inadimplente') {
      redirect('/portal/login?erro=conta_inativa')
    }

    await prisma.portalToken.update({ where: { id: r.id }, data: { usedAt: new Date() } })

    // Cria sessão e redireciona — signInPortal lança NEXT_REDIRECT internamente
    await signInPortal('portal-token', {
      id:         r.cliente.id,
      nome:       r.cliente.nome,
      email:      r.cliente.email ?? '',
      tipo:       'cliente',
      empresaId:  r.empresaId!,
      redirectTo: '/portal/dashboard',
    } as any)
  }

  if (r.socio) {
    if (!r.socio.portalAccess) redirect('/portal/login?erro=acesso_negado')
    if (!r.socio.email)        redirect('/portal/login?erro=token_invalido')

    await prisma.portalToken.update({ where: { id: r.id }, data: { usedAt: new Date() } })

    await signInPortal('portal-token', {
      id:         r.socio.id,
      nome:       r.socio.nome,
      email:      r.socio.email!,
      tipo:       'socio',
      empresaId:  r.empresaId!,
      redirectTo: '/portal/dashboard',
    } as any)
  }

  // Sem cliente nem sócio no record — não deveria acontecer
  redirect('/portal/login?erro=token_invalido')
}
