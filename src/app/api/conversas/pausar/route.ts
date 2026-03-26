import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { conversaId } = await req.json() as { conversaId: string }
  if (!conversaId) return NextResponse.json({ error: 'conversaId obrigatório' }, { status: 400 })

  await prisma.conversaIA.update({
    where: { id: conversaId },
    data: { pausadaEm: new Date(), pausadoPorId: user.id ?? null },
  })

  return NextResponse.json({ ok: true })
}
