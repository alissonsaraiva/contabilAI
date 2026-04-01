/**
 * GET  /api/crm/notas-fiscais  — lista notas fiscais (filtros: clienteId, status, mes)
 * POST /api/crm/notas-fiscais  — emite nova NFS-e
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { emitirNotaFiscal } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clienteId = searchParams.get('clienteId')
  const status    = searchParams.get('status')
  const mes       = searchParams.get('mes')   // formato "2026-01"
  const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize  = Math.min(100, parseInt(searchParams.get('pageSize') ?? '20'))

  const where: Record<string, unknown> = {}
  if (clienteId) where.clienteId = clienteId
  if (status)    where.status    = status

  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, mesNum] = mes.split('-').map(Number)
    where.criadoEm = {
      gte: new Date(ano, mesNum - 1, 1),
      lt:  new Date(ano, mesNum, 1),
    }
  }

  const [total, notas] = await Promise.all([
    prisma.notaFiscal.count({ where: where as never }),
    prisma.notaFiscal.findMany({
      where:   where as never,
      orderBy: { criadoEm: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      include: {
        cliente:      { select: { nome: true, email: true } },
        ordemServico: { select: { numero: true, titulo: true } },
      },
    }),
  ])

  return NextResponse.json({
    items: notas,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const {
    clienteId, ordemServicoId, descricao, valor,
    tomadorNome, tomadorCpfCnpj, tomadorEmail,
    tomadorMunicipio, tomadorEstado,
    issAliquota, issRetido, federalServiceCode, cityServiceCode, taxationType,
  } = body

  if (!clienteId)     return NextResponse.json({ error: 'clienteId obrigatório' }, { status: 400 })
  if (!descricao)     return NextResponse.json({ error: 'descricao obrigatória' }, { status: 400 })
  if (!valor)         return NextResponse.json({ error: 'valor obrigatório' }, { status: 400 })
  if (!tomadorNome)   return NextResponse.json({ error: 'tomadorNome obrigatório' }, { status: 400 })
  if (!tomadorCpfCnpj) return NextResponse.json({ error: 'tomadorCpfCnpj obrigatório' }, { status: 400 })

  try {
    const resultado = await emitirNotaFiscal({
      clienteId:         clienteId as string,
      ordemServicoId:    ordemServicoId as string | undefined,
      descricao:         descricao as string,
      valor:             Number(valor),
      tomadorNome:       tomadorNome as string,
      tomadorCpfCnpj:    tomadorCpfCnpj as string,
      tomadorEmail:      tomadorEmail as string | undefined,
      tomadorMunicipio:  tomadorMunicipio as string | undefined,
      tomadorEstado:     tomadorEstado as string | undefined,
      issAliquota:       issAliquota ? Number(issAliquota) : undefined,
      issRetido:         issRetido === true || issRetido === 'true',
      federalServiceCode: federalServiceCode as string | undefined,
      cityServiceCode:   cityServiceCode as string | undefined,
      taxationType:      taxationType as string | undefined,
      emitidaPorId:      (session.user as any)?.id,
    })

    if (!resultado.sucesso) {
      return NextResponse.json({ error: resultado.detalhe, motivo: resultado.motivo }, { status: 422 })
    }

    return NextResponse.json(resultado, { status: 201 })
  } catch (err) {
    logger.error('api-crm-notas-fiscais-post', { err })
    Sentry.captureException(err, { tags: { module: 'crm-nfse', operation: 'emitir' } })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
