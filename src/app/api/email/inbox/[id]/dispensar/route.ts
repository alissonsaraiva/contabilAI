import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

/** PATCH /api/email/inbox/[id]/dispensar — marca email como tratado sem responder */
export async function PATCH(_req: Request, { params }: Params) {
  const session = await auth()
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const interacao = await prisma.interacao.findFirst({
    where: { id, tipo: 'email_recebido' },
    select: { id: true, respondidoEm: true },
  })
  if (!interacao) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (interacao.respondidoEm) return NextResponse.json({ error: 'Já tratado' }, { status: 409 })

  await prisma.interacao.update({
    where: { id },
    data: {
      respondidoEm:    new Date(),
      respondidoPorId: user.id,
    },
  })

  return NextResponse.json({ ok: true })
}
