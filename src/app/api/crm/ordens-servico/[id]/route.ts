import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ordem   = await prisma.ordemServico.findUnique({
    where:   { id },
    include: {
      cliente: { select: { id: true, nome: true, email: true, telefone: true } },
      empresa: { select: { razaoSocial: true, nomeFantasia: true } },
    },
  })

  if (!ordem) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
  return NextResponse.json(ordem)
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body    = await req.json()

  const existing = await prisma.ordemServico.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (body.status !== undefined)    updateData.status    = body.status
  if (body.resposta !== undefined)  updateData.resposta  = body.resposta
  if (body.prioridade !== undefined) updateData.prioridade = body.prioridade

  if (body.resposta && !existing.respondidoEm) {
    updateData.respondidoEm    = new Date()
    updateData.respondidoPorId = (session.user as any)?.id ?? null
  }

  if ((body.status === 'resolvida' || body.status === 'cancelada') && !existing.fechadoEm) {
    updateData.fechadoEm = new Date()
  }

  const ordem = await prisma.ordemServico.update({
    where: { id },
    data:  updateData,
  })

  return NextResponse.json(ordem)
}
