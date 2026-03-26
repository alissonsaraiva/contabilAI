import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { registrarIaRetomada } from '@/lib/historico'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  const conversa = await prisma.conversaIA.update({
    where: { id },
    data: { pausadaEm: null, pausadoPorId: null },
    select: { clienteId: true, leadId: true },
  })

  registrarIaRetomada({
    conversaId:   id,
    operadorId:   user.id,
    operadorNome: user.name ?? 'Operador',
    clienteId:    conversa.clienteId ?? undefined,
    leadId:       conversa.leadId    ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
