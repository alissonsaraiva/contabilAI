import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import type { TipoOS, Prioridade } from '@prisma/client'

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { clienteId, tipo, titulo, descricao, visivelPortal, prioridade } = body

  if (!clienteId)        return NextResponse.json({ error: 'clienteId obrigatório' }, { status: 400 })
  if (!titulo?.trim())   return NextResponse.json({ error: 'título obrigatório' }, { status: 400 })
  if (!descricao?.trim()) return NextResponse.json({ error: 'descrição obrigatória' }, { status: 400 })

  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: { id: true, empresaId: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const os = await prisma.chamado.create({
    data: {
      clienteId,
      empresaId:     cliente.empresaId ?? undefined,
      tipo:          (tipo as TipoOS)       || 'solicitacao',
      origem:        'operador',
      titulo:        titulo.trim(),
      descricao:     descricao.trim(),
      visivelPortal: visivelPortal !== false,
      prioridade:    (prioridade as Prioridade) || 'media',
    },
    include: {
      cliente: { select: { nome: true } },
    },
  })

  indexarAsync('os', {
    id:            os.id,
    clienteId:     os.clienteId,
    tipo:          os.tipo,
    titulo:        os.titulo,
    descricao:     os.descricao,
    status:        os.status,
    origem:        os.origem,
    prioridade:    os.prioridade,
    visivelPortal: os.visivelPortal,
    criadoEm:      os.criadoEm,
  })

  return NextResponse.json(os, { status: 201 })
}

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
    prisma.chamado.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take:    limit,
      include: {
        cliente: { select: { nome: true, email: true } },
        empresa: { select: { razaoSocial: true, nomeFantasia: true } },
      },
    }),
    prisma.chamado.count({ where }),
  ])

  return NextResponse.json({ ordens, total, page, pages: Math.ceil(total / limit) })
}
