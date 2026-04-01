/**
 * GET /api/portal/notas-fiscais/[id]/xml — proxy autenticado para XML da Spedy
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { getSpedyClienteClient } from '@/lib/spedy'
import { logger } from '@/lib/logger'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { id } = await params
  const nota = await prisma.notaFiscal.findUnique({
    where:   { id },
    include: { empresa: true },
  })

  if (!nota || nota.clienteId !== clienteId) {
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

  try {
    const spedyClient = getSpedyClienteClient({
      spedyApiKey:   empresa.spedyApiKey,
      spedyAmbiente: config?.spedyAmbiente,
    })

    const xmlUrl = spedyClient.xmlUrl(nota.spedyId)
    const xmlResponse = await fetch(xmlUrl)

    if (!xmlResponse.ok) {
      logger.warn('portal-nfse-xml-spedy-erro', { notaId: nota.id, status: xmlResponse.status })
      return NextResponse.json({ error: 'XML indisponível na Spedy' }, { status: 502 })
    }

    const xmlBuffer = await xmlResponse.arrayBuffer()
    const numero = nota.numero ? `NFS-e-${nota.numero}` : 'NFS-e'

    return new NextResponse(xmlBuffer, {
      headers: {
        'Content-Type':        'application/xml',
        'Content-Disposition': `attachment; filename="${numero}.xml"`,
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch (err) {
    logger.error('portal-nfse-xml-falhou', { notaId: nota.id, err })
    Sentry.captureException(err, { tags: { module: 'portal-nfse', operation: 'xml' }, extra: { notaId: nota.id } })
    return NextResponse.json({ error: 'Erro ao obter XML' }, { status: 500 })
  }
}
