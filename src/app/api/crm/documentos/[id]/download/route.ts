/**
 * GET /api/crm/documentos/[id]/download
 * Gera URL assinada (5 min) para download de documento no R2. Apenas operadores CRM.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDownloadUrl } from '@/lib/storage'
import * as Sentry from '@sentry/nextjs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const doc = await prisma.documento.findUnique({
    where:  { id, deletadoEm: null },
    select: { url: true, nome: true, mimeType: true },
  })

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })

  const publicBase = (process.env.STORAGE_PUBLIC_URL ?? '').replace(/\/$/, '')

  if (publicBase && doc.url.startsWith(publicBase)) {
    const key = doc.url.slice(publicBase.length + 1)
    try {
      const signedUrl = await getDownloadUrl(key, 300)
      return NextResponse.redirect(signedUrl, { status: 302 })
    } catch (err) {
      console.error('[crm/documentos/download] falha ao gerar URL assinada:', { id, err })
      Sentry.captureException(err, { tags: { module: 'crm-documentos', operation: 'download' }, extra: { id } })
      return NextResponse.json({ error: 'Não foi possível gerar o link de download.' }, { status: 502 })
    }
  }

  // URL externa (DocuSeal, integração externa) — redireciona diretamente
  return NextResponse.redirect(doc.url, { status: 302 })
}
