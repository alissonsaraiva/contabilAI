import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { resolveClienteId } from '@/lib/portal-session'
import { prisma } from '@/lib/prisma'
import { getDownloadUrl } from '@/lib/storage'

export async function GET(
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
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

  const doc = await prisma.documento.findFirst({
    where: { id, clienteId },
    select: { url: true, nome: true, mimeType: true },
  })

  if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })

  const publicBase = (process.env.STORAGE_PUBLIC_URL ?? '').replace(/\/$/, '')

  // Se a URL começa com o base público, extraímos o key e geramos URL assinada
  if (publicBase && doc.url.startsWith(publicBase)) {
    const key = doc.url.slice(publicBase.length + 1) // remove "/"
    let signedUrl: string
    try {
      signedUrl = await getDownloadUrl(key, 300) // 5 min
    } catch (err) {
      console.error('[portal/documentos/download] falha ao gerar URL assinada:', err)
      Sentry.captureException(err, { tags: { module: 'portal-documentos-download', operation: 'signed-url' }, extra: { documentoId: id, clienteId } })
      return NextResponse.json({ error: 'Não foi possível gerar o link de download. Tente novamente.' }, { status: 502 })
    }
    return NextResponse.redirect(signedUrl, { status: 302 })
  }

  // URL externa (ex: DocuSeal, integração) — redireciona diretamente
  return NextResponse.redirect(doc.url, { status: 302 })
}
