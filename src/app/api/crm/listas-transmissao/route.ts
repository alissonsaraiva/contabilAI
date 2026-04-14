import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import * as Sentry from '@sentry/nextjs'

const LIMITE_LISTAS = 50

/** GET — Listar todas as listas de transmissão (com contagem de membros e último envio) */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const listas = await prisma.listaTransmissao.findMany({
      orderBy: { atualizadaEm: 'desc' },
      take: LIMITE_LISTAS,
      include: {
        _count: { select: { membros: true } },
        criador: { select: { id: true, nome: true } },
        envios: {
          orderBy: { criadoEm: 'desc' },
          take: 1,
          select: { id: true, criadoEm: true, status: true, totalMembros: true, totalEnviados: true, totalFalhas: true },
        },
      },
    })

    return NextResponse.json({
      listas: listas.map(l => ({
        id: l.id,
        nome: l.nome,
        criador: l.criador,
        totalMembros: l._count.membros,
        ultimoEnvio: l.envios[0] ?? null,
        criadaEm: l.criadaEm.toISOString(),
        atualizadaEm: l.atualizadaEm.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[listas-transmissao] erro ao listar:', err)
    Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'listar' } })
    return NextResponse.json({ error: 'Erro ao listar listas' }, { status: 500 })
  }
}

/** POST — Criar nova lista de transmissão */
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const body = await req.json()
    const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
    if (!nome || nome.length > 100) {
      return NextResponse.json({ error: 'Nome obrigatório (máx 100 caracteres)' }, { status: 400 })
    }

    const lista = await prisma.listaTransmissao.create({
      data: {
        nome,
        criadaPorId: session.user.id,
      },
    })

    return NextResponse.json({ lista }, { status: 201 })
  } catch (err) {
    console.error('[listas-transmissao] erro ao criar:', err)
    Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'criar' } })
    return NextResponse.json({ error: 'Erro ao criar lista' }, { status: 500 })
  }
}
