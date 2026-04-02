/**
 * GET /api/crm/notas-fiscais/[id]/xml — proxy autenticado para XML da Spedy (uso interno CRM)
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSpedyClienteClient } from '@/lib/spedy'
import { getDownloadUrl } from '@/lib/storage'
import { logger } from '@/lib/logger'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const tipo = (session?.user as Record<string, unknown>)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  const nota = await prisma.notaFiscal.findUnique({
    where:   { id },
    include: { empresa: true },
  })

  if (!nota) {
    return NextResponse.json({ error: 'Nota fiscal não encontrada' }, { status: 404 })
  }
  if (!nota.spedyId) {
    return NextResponse.json({ error: 'XML não disponível' }, { status: 422 })
  }

  const config = await prisma.escritorio.findFirst({
    select: { spedyAmbiente: true },
  })

  const empresa = nota.empresa
  if (!empresa?.spedyApiKey) {
    return NextResponse.json({ error: 'Configuração fiscal indisponível' }, { status: 422 })
  }

  const numero = nota.numero ? `NFS-e-${nota.numero}` : 'NFS-e'

  try {
    // Tenta R2 primeiro (cópia local salva ao autorizar — mais resiliente)
    const r2Key = nota.xmlUrl && !nota.xmlUrl.startsWith('https://') ? nota.xmlUrl : null
    if (r2Key) {
      try {
        const signedUrl = await getDownloadUrl(r2Key, 3600)
        return NextResponse.redirect(signedUrl, { status: 302 })
      } catch (r2Err) {
        logger.warn('crm-nfse-xml-r2-falhou', { notaId: nota.id, r2Err })
        // cai no fallback Spedy abaixo
      }
    }

    // Fallback: proxy direto da Spedy
    const spedyClient = getSpedyClienteClient({
      spedyApiKey:   empresa.spedyApiKey,
      spedyAmbiente: config?.spedyAmbiente,
    })

    const xmlResponse = await fetch(spedyClient.xmlUrl(nota.spedyId))

    if (!xmlResponse.ok) {
      logger.warn('crm-nfse-xml-spedy-erro', { notaId: nota.id, status: xmlResponse.status })
      return NextResponse.json({ error: 'XML indisponível na Spedy' }, { status: 502 })
    }

    const xmlBuffer = await xmlResponse.arrayBuffer()

    return new NextResponse(xmlBuffer, {
      headers: {
        'Content-Type':        'application/xml',
        'Content-Disposition': `attachment; filename="${numero}.xml"`,
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch (err) {
    logger.error('crm-nfse-xml-falhou', { notaId: nota.id, err })
    Sentry.captureException(err, { tags: { module: 'crm-nfse', operation: 'xml' }, extra: { notaId: nota.id } })
    return NextResponse.json({ error: 'Erro ao obter XML' }, { status: 500 })
  }
}
