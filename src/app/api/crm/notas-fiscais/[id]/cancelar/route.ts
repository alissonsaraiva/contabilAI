/**
 * POST /api/crm/notas-fiscais/[id]/cancelar
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { cancelarNotaFiscal } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { justificativa?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { justificativa } = body
  if (!justificativa || justificativa.trim().length < 15) {
    return NextResponse.json(
      { error: 'Justificativa obrigatória (mínimo 15 caracteres)' },
      { status: 400 },
    )
  }

  try {
    const resultado = await cancelarNotaFiscal(id, justificativa.trim())
    if (!resultado.sucesso) {
      return NextResponse.json({ error: resultado.detalhe }, { status: 422 })
    }
    return NextResponse.json({ sucesso: true })
  } catch (err) {
    logger.error('api-crm-cancelar-nfse', { id, err })
    Sentry.captureException(err, { tags: { module: 'crm-nfse', operation: 'cancelar' }, extra: { id } })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
