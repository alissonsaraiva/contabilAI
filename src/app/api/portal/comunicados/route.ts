import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const comunicados = await prisma.comunicado.findMany({
    where: {
      publicado: true,
      OR: [
        { expiradoEm: null },
        { expiradoEm: { gt: now } },
      ],
    },
    orderBy: { publicadoEm: 'desc' },
    take:    10,
    select: { id: true, titulo: true, conteudo: true, tipo: true, publicadoEm: true, anexoUrl: true, anexoNome: true },
  })

  return NextResponse.json(comunicados)
}
