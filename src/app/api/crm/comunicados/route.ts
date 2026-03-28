import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 20
  const skip  = (page - 1) * limit

  const [comunicados, total] = await Promise.all([
    prisma.comunicado.findMany({
      orderBy: { criadoEm: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.comunicado.count(),
  ])

  return NextResponse.json({ comunicados, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { titulo, conteudo, tipo, publicar, expiradoEm } = body

  if (!titulo?.trim() || !conteudo?.trim()) {
    return NextResponse.json({ error: 'Título e conteúdo são obrigatórios' }, { status: 400 })
  }

  const comunicado = await prisma.comunicado.create({
    data: {
      titulo:     titulo.trim(),
      conteudo:   conteudo.trim(),
      tipo:       tipo ?? 'informativo',
      publicado:  !!publicar,
      publicadoEm: publicar ? new Date() : null,
      expiradoEm:  expiradoEm ? new Date(expiradoEm) : null,
      criadoPorId: (session.user as any)?.id ?? null,
    },
  })

  if (comunicado.publicado) {
    indexarAsync('comunicado', comunicado)
  }

  return NextResponse.json(comunicado, { status: 201 })
}
