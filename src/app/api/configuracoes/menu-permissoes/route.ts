import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { MENUS_DISPONIVEIS } from '@/lib/menu-permissoes'

const hrefs = MENUS_DISPONIVEIS.map(m => m.href) as [string, ...string[]]

const schema = z.object({
  contador:   z.array(z.enum(hrefs)),
  assistente: z.array(z.enum(hrefs)),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || (session.user as any).tipo !== 'admin') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }
    const escritorio = await prisma.escritorio.findFirst({
      select: { menuPermissoes: true },
    })
    return NextResponse.json({ menuPermissoes: escritorio?.menuPermissoes ?? null })
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'configuracoes', operation: 'get-menu-permissoes' } })
    return NextResponse.json({ error: 'Erro ao buscar permissões' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth()
    if (!session?.user || (session.user as any).tipo !== 'admin') {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { contador, assistente } = parsed.data
    const payload = { contador, assistente }

    const escritorio = await prisma.escritorio.findFirst({ select: { id: true } })
    if (!escritorio) {
      return NextResponse.json({ error: 'Escritório não encontrado' }, { status: 404 })
    }

    await prisma.escritorio.update({
      where: { id: escritorio.id },
      data:  { menuPermissoes: payload },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'configuracoes', operation: 'patch-menu-permissoes' } })
    return NextResponse.json({ error: 'Erro ao salvar permissões' }, { status: 500 })
  }
}
