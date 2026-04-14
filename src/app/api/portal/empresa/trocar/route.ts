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

const IS_PROD = process.env.NODE_ENV === 'production'
import { prisma } from '@/lib/prisma'
import { getEmpresasCliente } from '@/lib/portal-session'
import { encode } from '@auth/core/jwt'

export async function POST(req: NextRequest) {
  // Log ANTES do auth — se sumir dos logs, a request nem chegou aqui
  const cookieNames = [...req.cookies.getAll()].map(c => c.name)
  const hasCookie   = cookieNames.includes(PORTAL_COOKIE_NAME)
  console.log('[portal/empresa/trocar] Request recebida:', {
    hasCookie,
    cookieNames: cookieNames.filter(n => n.includes('portal')),
  })

  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    console.warn('[portal/empresa/trocar] 401 — auth() falhou:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      tipo: user?.tipo,
      hasCookie,
    })
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const novaEmpresaId = typeof body?.empresaId === 'string' ? body.empresaId : null
  if (!novaEmpresaId) {
    return NextResponse.json({ error: 'empresaId obrigatório' }, { status: 400 })
  }

  try {
    console.log('[portal/empresa/trocar] Início:', {
      userId: user.id,
      tipo: user.tipo,
      empresaAtual: user.empresaId,
      novaEmpresaId,
    })

    // id e nome podem mudar quando sócio troca de empresa (cada empresa tem seu registro Socio)
    let novoUserId   = user.id   as string
    let novoUserName = user.name as string | null | undefined
    let empresaIds:    string[]

    if (user.tipo === 'cliente') {
      // Cliente: valida via ClienteEmpresa
      const ids = await getEmpresasCliente(user.id)
      console.log('[portal/empresa/trocar] Empresas do cliente:', { userId: user.id, ids })
      if (!ids.includes(novaEmpresaId)) {
        console.warn('[portal/empresa/trocar] 403 — sem acesso:', { userId: user.id, novaEmpresaId, ids })
        return NextResponse.json({ error: 'Sem acesso a esta empresa' }, { status: 403 })
      }
      empresaIds = ids
    } else {
      // Sócio: cada empresa tem um registro Socio distinto (com id próprio).
      // A validação NÃO pode usar { id: user.id, empresaId: novaEmpresaId } porque
      // user.id é o Socio.id da empresa ATUAL — nunca bate com outra empresa.
      // Usamos CPF para localizar o registro Socio da empresa-alvo.
      const socioAtual = await prisma.socio.findUnique({
        where:  { id: user.id },
        select: { cpf: true },
      })
      if (!socioAtual?.cpf) {
        return NextResponse.json({ error: 'Sem acesso a esta empresa' }, { status: 403 })
      }
      const novoSocio = await prisma.socio.findFirst({
        where:  { cpf: socioAtual.cpf, empresaId: novaEmpresaId, portalAccess: true },
        select: { id: true, nome: true },
      })
      if (!novoSocio) {
        return NextResponse.json({ error: 'Sem acesso a esta empresa' }, { status: 403 })
      }
      // Atualiza id e nome para o registro Socio da nova empresa
      novoUserId   = novoSocio.id
      novoUserName = novoSocio.nome
      // Preserva a lista completa de empresas via CPF
      const todos = await prisma.socio.findMany({
        where:  { cpf: socioAtual.cpf, portalAccess: true },
        select: { empresaId: true },
      })
      empresaIds = todos.length > 0 ? todos.map(s => s.empresaId) : [novaEmpresaId]
    }

    const maxAge = 30 * 24 * 60 * 60

    const jwt = await encode({
      token: {
        sub:        novoUserId,
        id:         novoUserId,
        name:       novoUserName,
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

    // ── Set-Cookie via headers.append — garante DOIS headers distintos ──
    // NextResponse.cookies.set() com o mesmo nome pode sobrescrever.
    // headers.append('Set-Cookie', ...) adiciona headers independentes.

    if (IS_PROD) {
      // 1) Deletar possível cookie host-only stale (sem domain)
      //    Cookies host-only têm precedência sobre domain cookies —
      //    se existir um stale, o browser envia ambos e o servidor lê o antigo.
      res.headers.append(
        'Set-Cookie',
        `${PORTAL_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      )
    }

    // 2) Setar o novo cookie com domain=.avos.digital
    const cookieParts = [
      `${PORTAL_COOKIE_NAME}=${jwt}`,
      'Path=/',
      `Max-Age=${maxAge}`,
      'HttpOnly',
      'SameSite=Lax',
    ]
    if (IS_PROD) {
      cookieParts.push('Secure', 'Domain=.avos.digital')
    }
    res.headers.append('Set-Cookie', cookieParts.join('; '))

    console.log('[portal/empresa/trocar] Cookie setado com sucesso:', {
      novoUserId,
      novaEmpresaId,
      empresaIds,
      cookieName: PORTAL_COOKIE_NAME,
      setCookieHeaders: res.headers.getSetCookie?.() ?? 'N/A',
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
