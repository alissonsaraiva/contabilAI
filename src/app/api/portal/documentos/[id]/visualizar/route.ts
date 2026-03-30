import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { resolveClienteId } from '@/lib/portal-session'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Não autorizado' }, { status: 400 })

  await prisma.documento.updateMany({
    where: { id, clienteId, visualizadoEm: null },
    data:  { visualizadoEm: new Date() },
  })

  return NextResponse.json({ ok: true })
}
