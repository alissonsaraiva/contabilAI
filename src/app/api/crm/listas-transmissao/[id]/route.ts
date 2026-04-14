import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import * as Sentry from '@sentry/nextjs'

type Ctx = { params: Promise<{ id: string }> }

/** GET — Detalhes da lista com membros */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await ctx.params

  try {
    const lista = await prisma.listaTransmissao.findUnique({
      where: { id },
      include: {
        criador: { select: { id: true, nome: true } },
        membros: {
          include: {
            cliente: { select: { id: true, nome: true, whatsapp: true, telefone: true, empresa: { select: { razaoSocial: true } } } },
            socio: { select: { id: true, nome: true, whatsapp: true, telefone: true, empresa: { select: { razaoSocial: true } } } },
          },
        },
        _count: { select: { membros: true } },
      },
    })

    if (!lista) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })

    return NextResponse.json({
      lista: {
        id: lista.id,
        nome: lista.nome,
        criador: lista.criador,
        totalMembros: lista._count.membros,
        criadaEm: lista.criadaEm.toISOString(),
        atualizadaEm: lista.atualizadaEm.toISOString(),
        membros: lista.membros.map(m => ({
          id: m.id,
          tipo: m.clienteId ? 'cliente' as const : 'socio' as const,
          clienteId: m.clienteId,
          socioId: m.socioId,
          nome: m.cliente?.nome ?? m.socio?.nome ?? 'Desconhecido',
          whatsapp: m.cliente?.whatsapp ?? m.cliente?.telefone ?? m.socio?.whatsapp ?? m.socio?.telefone ?? null,
          empresa: m.cliente?.empresa?.razaoSocial ?? m.socio?.empresa?.razaoSocial ?? null,
        })),
      },
    })
  } catch (err) {
    console.error('[listas-transmissao] erro ao buscar:', err)
    Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'buscar' }, extra: { listaId: id } })
    return NextResponse.json({ error: 'Erro ao buscar lista' }, { status: 500 })
  }
}

/** PATCH — Renomear lista */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await ctx.params

  try {
    const body = await req.json()
    const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
    if (!nome || nome.length > 100) {
      return NextResponse.json({ error: 'Nome obrigatório (máx 100 caracteres)' }, { status: 400 })
    }

    const lista = await prisma.listaTransmissao.update({
      where: { id },
      data: { nome },
    })

    return NextResponse.json({ lista })
  } catch (err) {
    if (isPrismaNotFound(err)) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
    console.error('[listas-transmissao] erro ao renomear:', err)
    Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'renomear' }, extra: { listaId: id } })
    return NextResponse.json({ error: 'Erro ao renomear lista' }, { status: 500 })
  }
}

/** DELETE — Excluir lista (cascade em membros, envios, destinatários) */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await ctx.params

  try {
    await prisma.listaTransmissao.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (isPrismaNotFound(err)) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
    console.error('[listas-transmissao] erro ao excluir:', err)
    Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'excluir' }, extra: { listaId: id } })
    return NextResponse.json({ error: 'Erro ao excluir lista' }, { status: 500 })
  }
}

/** Detecta Prisma P2025 (Record not found) sem importar o tipo */
function isPrismaNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2025'
}
