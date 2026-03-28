import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { enviarComunicadoPorEmail } from '@/lib/email/comunicado'

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

  let dispararEmail = false
  const statusEmail: string[] = Array.isArray(body.statusEmail) ? body.statusEmail : ['ativo', 'inadimplente']
  if (body.publicar === true && !existing.publicado && body.enviarEmail === true) {
    dispararEmail = true
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

  // Dispara e-mail para clientes nos status selecionados — fire-and-forget
  if (dispararEmail) {
    const { StatusCliente } = await import('@prisma/client')
    const statusValidos = Object.values(StatusCliente)
    const filtro = statusEmail.filter(s => statusValidos.includes(s as any)) as any[]
    enviarComunicadoPorEmail(comunicado.id, filtro.length > 0 ? filtro : ['ativo', 'inadimplente']).catch(() => {})
  }

  return NextResponse.json({ ...comunicado, emailDisparado: dispararEmail })
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
