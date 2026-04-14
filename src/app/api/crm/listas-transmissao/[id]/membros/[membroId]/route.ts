import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import * as Sentry from '@sentry/nextjs'

type Ctx = { params: Promise<{ id: string; membroId: string }> }

/** DELETE — Remover membro da lista */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id: listaId, membroId } = await ctx.params

  try {
    await prisma.membroListaTransmissao.delete({
      where: { id: membroId, listaId },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    // P2025: membro não encontrado
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    }
    console.error('[listas-transmissao] erro ao remover membro:', err)
    Sentry.captureException(err, {
      tags: { module: 'broadcast', operation: 'remover-membro' },
      extra: { listaId, membroId },
    })
    return NextResponse.json({ error: 'Erro ao remover membro' }, { status: 500 })
  }
}
