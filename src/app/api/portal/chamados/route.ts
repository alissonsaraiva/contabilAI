import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { indexarAsync } from '@/lib/rag/indexar-async'

export async function GET(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 20
  const skip  = (page - 1) * limit

  const [ordens, total] = await Promise.all([
    prisma.chamado.findMany({
      where:   { clienteId },
      orderBy: { criadoEm: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.chamado.count({ where: { clienteId } }),
  ])

  return NextResponse.json({ ordens, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const body = await req.json()
  const { tipo, titulo, descricao, prioridade } = body

  if (!titulo?.trim() || !descricao?.trim()) {
    return NextResponse.json({ error: 'Título e descrição são obrigatórios' }, { status: 400 })
  }

  // Get empresaId from the cliente
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { empresaId: true },
  })

  const ordem = await prisma.chamado.create({
    data: {
      clienteId,
      empresaId:  cliente?.empresaId ?? null,
      tipo:       tipo ?? 'duvida',
      titulo:     titulo.trim(),
      descricao:  descricao.trim(),
      prioridade: prioridade ?? 'media',
    },
  })

  indexarAsync('os', {
    id:            ordem.id,
    clienteId:     ordem.clienteId,
    tipo:          ordem.tipo,
    titulo:        ordem.titulo,
    descricao:     ordem.descricao,
    status:        ordem.status,
    origem:        ordem.origem,
    prioridade:    ordem.prioridade,
    visivelPortal: ordem.visivelPortal,
    criadoEm:      ordem.criadoEm,
  })

  return NextResponse.json(ordem, { status: 201 })
}
