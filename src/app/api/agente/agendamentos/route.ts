import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

/** PATCH /api/agente/agendamentos — toggle ativo/inativo */
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id, ativo } = await req.json() as { id: string; ativo: boolean }
  if (!id || typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'id e ativo são obrigatórios' }, { status: 400 })
  }

  const agendamento = await prisma.agendamentoAgente.update({
    where: { id },
    data:  { ativo },
    select: { id: true, ativo: true },
  })

  return NextResponse.json(agendamento)
}

/** DELETE /api/agente/agendamentos — remove permanentemente */
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  await prisma.agendamentoAgente.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
