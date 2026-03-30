/**
 * DELETE /api/crm/documentos/[id]
 * Soft-delete de documento (seta deletadoEm). Apenas operadores CRM.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const doc = await prisma.documento.findUnique({
    where:  { id },
    select: { id: true, deletadoEm: true },
  })

  if (!doc)            return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (doc.deletadoEm)  return NextResponse.json({ error: 'Já deletado' },    { status: 409 })

  await prisma.documento.update({
    where: { id },
    data:  { deletadoEm: new Date() },
  })

  return NextResponse.json({ ok: true })
}
