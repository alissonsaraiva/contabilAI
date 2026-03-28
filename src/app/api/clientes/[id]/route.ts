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
    include: { empresa: { include: { socios: true } }, documentos: true, contratos: true, tarefas: true, interacoes: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(cliente)
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // Separar campos do Cliente dos campos da Empresa
  const { cnpj, razaoSocial, nomeFantasia, regime, ...clienteData } = body
  const empresaFields = { cnpj: cnpj || null, razaoSocial: razaoSocial || null, nomeFantasia: nomeFantasia || null, regime: regime || null }
  const temCamposEmpresa = 'cnpj' in body || 'razaoSocial' in body || 'nomeFantasia' in body || 'regime' in body

  const cliente = await prisma.$transaction(async (tx) => {
    const updated = await tx.cliente.update({
      where: { id },
      data: clienteData,
      include: { empresa: { include: { socios: true } } },
    })

    if (temCamposEmpresa) {
      if (updated.empresaId) {
        await tx.empresa.update({ where: { id: updated.empresaId }, data: empresaFields })
      } else {
        // Cliente sem empresa ainda — cria e vincula
        const empresa = await tx.empresa.create({ data: empresaFields })
        await tx.cliente.update({ where: { id }, data: { empresaId: empresa.id } })
      }
    }

    return tx.cliente.findUnique({
      where: { id },
      include: { empresa: { include: { socios: true } } },
    })
  })

  if (cliente) {
    import('@/lib/rag/ingest').then(({ indexarCliente }) => indexarCliente({
      ...cliente,
      cnpj: cliente.empresa?.cnpj ?? null,
      razaoSocial: cliente.empresa?.razaoSocial ?? null,
      nomeFantasia: cliente.empresa?.nomeFantasia ?? null,
      regime: cliente.empresa?.regime ?? null,
      socios: cliente.empresa?.socios ?? [],
    })).catch(() => {})
  }

  return NextResponse.json(cliente)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.cliente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
