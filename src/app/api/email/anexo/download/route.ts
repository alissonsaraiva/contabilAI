/**
 * GET /api/email/anexo/download?url=<encoded_r2_url>
 * Gera URL assinada (5 min) para download de anexo de email no R2. Apenas operadores CRM.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDownloadUrl } from '@/lib/storage'
import * as Sentry from '@sentry/nextjs'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const url = searchParams.get('url')

  if (!url) return NextResponse.json({ error: 'Parâmetro url ausente' }, { status: 400 })

  const publicBase = (process.env.STORAGE_PUBLIC_URL ?? '').replace(/\/$/, '')

  if (!publicBase || !url.startsWith(publicBase)) {
    return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
  }

  const key = url.slice(publicBase.length + 1)

  try {
    const signedUrl = await getDownloadUrl(key, 300)
    return NextResponse.redirect(signedUrl, { status: 302 })
  } catch (err) {
    console.error('[email/anexo/download] falha ao gerar URL assinada:', { key, err })
    Sentry.captureException(err, {
      tags: { module: 'email-anexo', operation: 'download' },
      extra: { key },
    })
    return NextResponse.json({ error: 'Não foi possível gerar o link de download.' }, { status: 502 })
  }
}
