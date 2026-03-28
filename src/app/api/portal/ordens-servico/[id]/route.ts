import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { id } = await params
  const ordem   = await prisma.ordemServico.findFirst({
    where: { id, clienteId },
  })

  if (!ordem) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })
  return NextResponse.json(ordem)
}

// Client can rate resolved OS or cancel open OS
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { id } = await params
  const body    = await req.json()

  const existing = await prisma.ordemServico.findFirst({
    where: { id, clienteId },
  })
  if (!existing) return NextResponse.json({ error: 'Não encontrada' }, { status: 404 })

  // Client actions: avaliar (nota + comentário) or cancelar
  const updateData: Record<string, unknown> = {}
  if (body.avaliacaoNota !== undefined) updateData.avaliacaoNota   = body.avaliacaoNota
  if (body.avaliacaoComent !== undefined) updateData.avaliacaoComent = body.avaliacaoComent
  if (body.status === 'cancelada' && existing.status === 'aberta') {
    updateData.status     = 'cancelada'
    updateData.fechadoEm  = new Date()
  }

  const ordem = await prisma.ordemServico.update({
    where: { id },
    data:  updateData,
  })

  return NextResponse.json(ordem)
}
