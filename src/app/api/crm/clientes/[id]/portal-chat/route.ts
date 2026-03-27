import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const conversas = await prisma.conversaIA.findMany({
    where: { clienteId: id, canal: 'portal' },
    orderBy: { atualizadaEm: 'desc' },
    take: 20,
    select: {
      id: true,
      criadaEm: true,
      atualizadaEm: true,
      mensagens: {
        orderBy: { criadaEm: 'asc' },
        select: { id: true, role: true, conteudo: true, criadaEm: true },
      },
    },
  })

  return NextResponse.json({ conversas })
}
