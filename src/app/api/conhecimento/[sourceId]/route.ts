import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteBySourceId } from '@/lib/rag'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { sourceId } = await params
  if (!sourceId) return NextResponse.json({ error: 'sourceId obrigatório' }, { status: 400 })

  await deleteBySourceId(sourceId)
  return NextResponse.json({ ok: true })
}
