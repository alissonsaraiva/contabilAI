import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

// Marca uma notificação específica como lida
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const usuarioId = (session?.user as any)?.id
  if (!session || !usuarioId) return NextResponse.json({ ok: false }, { status: 401 })

  const { id } = await params

  await prisma.notificacao.updateMany({
    where: { id, usuarioId },
    data: { lida: true },
  })

  return NextResponse.json({ ok: true })
}
