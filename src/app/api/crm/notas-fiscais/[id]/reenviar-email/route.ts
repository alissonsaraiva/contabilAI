/**
 * POST /api/crm/notas-fiscais/[id]/reenviar-email
 *
 * Solicita à Spedy que reenvie o e-mail da NFS-e ao tomador.
 * Só funciona se a nota foi emitida com e-mail do tomador preenchido.
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSpedyClienteClient, SpedyError } from '@/lib/spedy'
import { logger } from '@/lib/logger'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const nota = await prisma.notaFiscal.findUnique({
    where:   { id },
    include: { empresa: { select: { spedyApiKey: true } } },
  })

  if (!nota) return NextResponse.json({ error: 'Nota fiscal não encontrada' }, { status: 404 })
  if (nota.status !== 'autorizada') {
    return NextResponse.json(
      { error: 'Reenvio de e-mail disponível apenas para notas autorizadas' },
      { status: 422 },
    )
  }
  if (!nota.spedyId) {
    return NextResponse.json({ error: 'Nota sem ID Spedy — não é possível reenviar' }, { status: 422 })
  }
  if (!nota.tomadorEmail) {
    return NextResponse.json(
      { error: 'Nota emitida sem e-mail do tomador — reenvio não disponível' },
      { status: 422 },
    )
  }
  if (!nota.empresa?.spedyApiKey) {
    return NextResponse.json({ error: 'Empresa sem configuração Spedy' }, { status: 422 })
  }

  try {
    const escritorio = await prisma.escritorio.findFirst({
      select: { spedyAmbiente: true },
    })
    const client = getSpedyClienteClient({
      spedyApiKey:   nota.empresa.spedyApiKey,
      spedyAmbiente: escritorio?.spedyAmbiente ?? null,
    })

    await client.reenviarEmailNfse(nota.spedyId)

    logger.info('nfse-reenviar-email', { notaId: id, spedyId: nota.spedyId, tomadorEmail: nota.tomadorEmail })
    return NextResponse.json({ sucesso: true })

  } catch (err) {
    logger.error('api-crm-reenviar-email-nfse', { id, err })
    Sentry.captureException(err, {
      tags:  { module: 'crm-nfse', operation: 'reenviar-email' },
      extra: { notaId: id, spedyId: nota.spedyId },
    })
    const msg = err instanceof SpedyError ? err.message : 'Erro interno ao reenviar e-mail'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
