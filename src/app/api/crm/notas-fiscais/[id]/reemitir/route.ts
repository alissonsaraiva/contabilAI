/**
 * POST /api/crm/notas-fiscais/[id]/reemitir — reemite nota rejeitada
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { reemitirNotaFiscal } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    // body opcional
  }

  try {
    const resultado = await reemitirNotaFiscal(id, {
      descricao:          body.descricao         as string | undefined,
      valor:              body.valor             ? Number(body.valor) : undefined,
      tomadorNome:        body.tomadorNome       as string | undefined,
      tomadorCpfCnpj:     body.tomadorCpfCnpj   as string | undefined,
      tomadorEmail:       body.tomadorEmail      as string | undefined,
      tomadorMunicipio:   body.tomadorMunicipio  as string | undefined,
      tomadorEstado:      body.tomadorEstado     as string | undefined,
      issAliquota:        body.issAliquota       ? Number(body.issAliquota) : undefined,
      issRetido:          body.issRetido         as boolean | undefined,
      federalServiceCode: body.federalServiceCode as string | undefined,
      cityServiceCode:    body.cityServiceCode   as string | undefined,
      emitidaPorId:       (session.user as any)?.id,
    })

    if (!resultado.sucesso) {
      return NextResponse.json({ error: resultado.detalhe, motivo: resultado.motivo }, { status: 422 })
    }

    return NextResponse.json(resultado)
  } catch (err) {
    logger.error('api-crm-reemitir-nfse', { id, err })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
