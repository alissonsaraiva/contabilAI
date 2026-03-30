import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { enviarComunicadoPorEmail } from '@/lib/email/comunicado'
import { uploadArquivo, storageKeys } from '@/lib/storage'
import type { TipoComunicado } from '@prisma/client'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 20
  const skip  = (page - 1) * limit

  const [comunicados, total] = await Promise.all([
    prisma.comunicado.findMany({
      orderBy: { criadoEm: 'desc' },
      skip,
      take:    limit,
    }),
    prisma.comunicado.count(),
  ])

  return NextResponse.json({ comunicados, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData    = await req.formData()
  const titulo      = (formData.get('titulo')   as string | null)?.trim()
  const conteudo    = (formData.get('conteudo') as string | null)?.trim()
  const tipo        = (formData.get('tipo')     as string | null) ?? 'informativo'
  const publicar    = formData.get('publicar')    === 'true'
  const enviarEmail = formData.get('enviarEmail') === 'true'
  const expiradoEm  = formData.get('expiradoEm') as string | null
  const anexo       = formData.get('anexo') as File | null

  if (!titulo || !conteudo) {
    return NextResponse.json({ error: 'Título e conteúdo são obrigatórios' }, { status: 400 })
  }

  // Cria comunicado primeiro para ter o ID (necessário para a storage key)
  const comunicado = await prisma.comunicado.create({
    data: {
      titulo,
      conteudo,
      tipo:        tipo as TipoComunicado,
      publicado:   publicar,
      publicadoEm: publicar ? new Date() : null,
      expiradoEm:  expiradoEm ? new Date(expiradoEm) : null,
      criadoPorId: (session.user as any)?.id ?? null,
    },
  })

  // Upload do anexo (se houver)
  if (anexo && anexo.size > 0) {
    const MAX_SIZE = 10 * 1024 * 1024
    if (anexo.size > MAX_SIZE) {
      await prisma.comunicado.delete({ where: { id: comunicado.id } })
      return NextResponse.json({ error: 'Arquivo muito grande. Limite: 10 MB.' }, { status: 413 })
    }

    const buffer  = Buffer.from(await anexo.arrayBuffer())
    const key     = storageKeys.comunicadoAnexo(comunicado.id, anexo.name)
    const url     = await uploadArquivo(key, buffer, anexo.type || 'application/octet-stream')

    await prisma.comunicado.update({
      where: { id: comunicado.id },
      data:  { anexoUrl: url, anexoNome: anexo.name },
    })

    comunicado.anexoUrl  = url
    comunicado.anexoNome = anexo.name
  }

  if (comunicado.publicado) {
    indexarAsync('comunicado', comunicado)
    if (enviarEmail) {
      enviarComunicadoPorEmail(comunicado.id).catch(() => {})
    }
  }

  return NextResponse.json(comunicado, { status: 201 })
}
