import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const relatorio = await prisma.relatorioAgente.findUnique({ where: { id } })
  if (!relatorio) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json(relatorio)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  await prisma.relatorioAgente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
