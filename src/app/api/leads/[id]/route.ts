import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      responsavel: { select: { id: true, nome: true } },
      contrato: true,
      documentos: true,
      interacoes: { orderBy: { criadoEm: 'desc' } },
    },
  })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(lead)
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const lead = await prisma.lead.update({ where: { id }, data: body })
  return NextResponse.json(lead)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  await prisma.lead.update({ where: { id }, data: { status: 'cancelado' } })
  return NextResponse.json({ ok: true })
}
