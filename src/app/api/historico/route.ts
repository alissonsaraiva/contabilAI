import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/historico
 *
 * Query params:
 *   clienteId, leadId, usuarioId — filtra por entidade
 *   origem     — "usuario" | "ia" | "agente" | "sistema"
 *   tipo       — string ou lista separada por vírgula (ex: nota_interna,tarefa_criada)
 *   global     — "true" → feed global do escritório (escritorioEvento=true)
 *   de, ate    — período ISO (ex: 2025-01-01)
 *   page, limit — paginação (default: page=1, limit=20)
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  const clienteId = searchParams.get('clienteId') ?? undefined
  const leadId    = searchParams.get('leadId')    ?? undefined
  const usuarioId = searchParams.get('usuarioId') ?? undefined
  const origem    = searchParams.get('origem')    ?? undefined
  const tiposRaw  = searchParams.get('tipo')
  const tipos     = tiposRaw ? tiposRaw.split(',').filter(Boolean) : []
  const isGlobal  = searchParams.get('global') === 'true'
  const deStr     = searchParams.get('de')
  const ateStr    = searchParams.get('ate')
  const de        = deStr  ? new Date(deStr)  : undefined
  const ate       = ateStr ? new Date(ateStr) : undefined
  const page      = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit     = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))
  const skip      = (page - 1) * limit

  const where: Prisma.InteracaoWhereInput = {
    ...(clienteId && { clienteId }),
    ...(leadId    && { leadId }),
    ...(usuarioId && { usuarioId }),
    ...(origem    && { origem }),
    ...(tipos.length > 0 && { tipo: { in: tipos } }),
    ...(isGlobal  && { escritorioEvento: true }),
    ...((de || ate) && {
      criadoEm: {
        ...(de  && { gte: de }),
        ...(ate && { lte: ate }),
      },
    }),
  }

  const [itens, total] = await Promise.all([
    prisma.interacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: limit,
      include: {
        usuario: { select: { nome: true, avatar: true } },
      },
    }),
    prisma.interacao.count({ where }),
  ])

  return NextResponse.json({
    itens,
    total,
    page,
    pages: Math.ceil(total / limit),
  })
}
