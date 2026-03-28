import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body    = await req.json()

  const existing = await prisma.comunicado.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const updateData: Record<string, unknown> = {}
  if (body.titulo !== undefined)     updateData.titulo    = body.titulo
  if (body.conteudo !== undefined)   updateData.conteudo  = body.conteudo
  if (body.tipo !== undefined)       updateData.tipo      = body.tipo
  if (body.expiradoEm !== undefined) updateData.expiradoEm = body.expiradoEm ? new Date(body.expiradoEm) : null

  if (body.publicar === true && !existing.publicado) {
    updateData.publicado   = true
    updateData.publicadoEm = new Date()
  }
  if (body.publicar === false) {
    updateData.publicado   = false
    updateData.publicadoEm = null
  }

  const comunicado = await prisma.comunicado.update({
    where: { id },
    data:  updateData,
  })

  // Re-indexa (publicado) ou remove do índice (despublicado)
  indexarAsync('comunicado', comunicado)

  return NextResponse.json(comunicado)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await prisma.comunicado.delete({ where: { id } })
  // Remove embeddings — passa publicado=false para disparar a remoção no indexarComunicado
  indexarAsync('comunicado', { id, publicado: false })
  return NextResponse.json({ ok: true })
}
