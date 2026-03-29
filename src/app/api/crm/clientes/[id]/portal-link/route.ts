import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { criarTokenPortal } from '@/lib/portal/tokens'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const cliente = await prisma.cliente.findUnique({
    where:  { id },
    select: { id: true, status: true, empresaId: true },
  })

  if (!cliente) {
    return NextResponse.json({ error: 'cliente_nao_encontrado' }, { status: 404 })
  }
  if (cliente.status === 'suspenso') {
    return NextResponse.json({ error: 'conta_suspensa' }, { status: 403 })
  }
  if (cliente.status === 'cancelado') {
    return NextResponse.json({ error: 'conta_cancelada' }, { status: 403 })
  }
  if (!cliente.empresaId) {
    return NextResponse.json({ error: 'empresa_nao_vinculada' }, { status: 400 })
  }

  const { link } = await criarTokenPortal(cliente.id, cliente.empresaId, 30 * 60 * 1000) // 30 min

  return NextResponse.json({ link })
}
