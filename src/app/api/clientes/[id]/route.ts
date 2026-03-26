import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: { socios: true, documentos: true, contratos: true, tarefas: true, interacoes: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(cliente)
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const cliente = await prisma.cliente.update({
    where: { id },
    data: body,
    include: { socios: true },
  })

  import('@/lib/rag/ingest').then(({ indexarCliente }) => indexarCliente(cliente)).catch(() => {})

  return NextResponse.json(cliente)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.cliente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
