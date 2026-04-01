/**
 * GET /api/portal/notas-fiscais/[id]/pdf — proxy autenticado para PDF da Spedy
 * Necessário porque o cliente não tem acesso direto à API Spedy
 */
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
    return NextResponse.json({ error: 'PDF não disponível' }, { status: 422 })
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

    const pdfUrl = spedyClient.pdfUrl(nota.spedyId)
    const pdfResponse = await fetch(pdfUrl)

    if (!pdfResponse.ok) {
      logger.warn('portal-nfse-pdf-spedy-erro', { notaId: nota.id, status: pdfResponse.status })
      return NextResponse.json({ error: 'PDF indisponível na Spedy' }, { status: 502 })
    }

    const pdfBuffer = await pdfResponse.arrayBuffer()
    const numero = nota.numero ? `NFS-e-${nota.numero}` : 'NFS-e'

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${numero}.pdf"`,
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch (err) {
    logger.error('portal-nfse-pdf-falhou', { notaId: nota.id, err })
    return NextResponse.json({ error: 'Erro ao obter PDF' }, { status: 500 })
  }
}
