import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const status  = searchParams.get('status') ?? undefined
  const limit   = 30
  const skip    = (page - 1) * limit

  const where = status ? { status: status as any } : {}

  const [ordens, total] = await Promise.all([
    prisma.ordemServico.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take:    limit,
      include: {
        cliente: { select: { nome: true, email: true } },
        empresa: { select: { razaoSocial: true, nomeFantasia: true } },
      },
    }),
    prisma.ordemServico.count({ where }),
  ])

  return NextResponse.json({ ordens, total, page, pages: Math.ceil(total / limit) })
}
