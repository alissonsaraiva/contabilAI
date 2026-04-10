/**
 * POST /api/portal/empresa/trocar
 * Body: { empresaId: string }
 *
 * Troca a empresa ativa da sessão do portal. Valida que o user tem acesso
 * à empresa (via ClienteEmpresa ou Socio), re-emite o JWT e retorna { ok: true }.
 */
import * as Sentry from '@sentry/nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { auth, PORTAL_COOKIE_NAME } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { getEmpresasCliente } from '@/lib/portal-session'
import { encode } from '@auth/core/jwt'

export async function POST(req: NextRequest) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const novaEmpresaId = typeof body?.empresaId === 'string' ? body.empresaId : null
  if (!novaEmpresaId) {
    return NextResponse.json({ error: 'empresaId obrigatório' }, { status: 400 })
  }

  try {
    // Valida acesso: cliente precisa ter a empresa na ClienteEmpresa; sócio precisa pertencer à empresa
    if (user.tipo === 'cliente') {
      const empresaIds = await getEmpresasCliente(user.id)
      if (!empresaIds.includes(novaEmpresaId)) {
        return NextResponse.json({ error: 'Sem acesso a esta empresa' }, { status: 403 })
      }
    } else {
      const socio = await prisma.socio.findFirst({
        where: { id: user.id, empresaId: novaEmpresaId, portalAccess: true },
        select: { id: true },
      })
      if (!socio) {
        return NextResponse.json({ error: 'Sem acesso a esta empresa' }, { status: 403 })
      }
    }

    // Re-emite JWT com nova empresaId ativa
    const empresaIds = user.tipo === 'cliente'
      ? await getEmpresasCliente(user.id)
      : [novaEmpresaId]

    const maxAge = 30 * 24 * 60 * 60

    const jwt = await encode({
      token: {
        sub:        user.id,
        id:         user.id,
        name:       user.name,
        email:      user.email,
        tipo:       user.tipo,
        empresaId:  novaEmpresaId,
        empresaIds: JSON.stringify(empresaIds),
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
  } catch (err) {
    console.error('[portal/empresa/trocar] Erro:', { userId: user.id, novaEmpresaId, err })
    Sentry.captureException(err, {
      tags:  { module: 'portal-empresa', operation: 'trocar' },
      extra: { userId: user.id, novaEmpresaId },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
