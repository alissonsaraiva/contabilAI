import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  ids:    z.array(z.string()).min(1).max(100),
  action: z.enum(['dispensar', 'excluir']),
})

/** POST /api/email/inbox/bulk — ações em massa sobre e-mails recebidos */
export async function POST(req: Request) {
  const session = await auth()
  const user = session?.user as any
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const { ids, action } = parsed.data

  if (action === 'dispensar') {
    await prisma.interacao.updateMany({
      where: {
        id:             { in: ids },
        tipo:           'email_recebido',
        respondidoEm:   null,
      },
      data: {
        respondidoEm:    new Date(),
        respondidoPorId: user.id,
      },
    })
    return NextResponse.json({ ok: true, action: 'dispensar', count: ids.length })
  }

  if (action === 'excluir') {
    await prisma.interacao.deleteMany({
      where: {
        id:   { in: ids },
        tipo: { in: ['email_recebido', 'email_enviado'] },
      },
    })
    return NextResponse.json({ ok: true, action: 'excluir', count: ids.length })
  }
}
