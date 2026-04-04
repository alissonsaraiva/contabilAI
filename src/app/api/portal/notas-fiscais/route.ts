/**
 * GET /api/portal/notas-fiscais — lista notas fiscais autorizadas do cliente autenticado
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'

export async function GET(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = 20
  const mes      = searchParams.get('mes') // formato "2026-01"

  // Mostra notas autorizadas e canceladas (cliente precisa ver o histórico completo)
  const where: Record<string, unknown> = {
    clienteId,
    status: { in: ['autorizada', 'cancelada'] },
  }

  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [ano, mesNum] = mes.split('-').map(Number)
    where.autorizadaEm = {
      gte: new Date(ano, mesNum - 1, 1),
      lt:  new Date(ano, mesNum, 1),
    }
  }

  const [total, notas] = await Promise.all([
    prisma.notaFiscal.count({ where: where as never }),
    prisma.notaFiscal.findMany({
      where:   where as never,
      orderBy: { autorizadaEm: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:            true,
        numero:        true,
        status:        true,
        descricao:     true,
        valorTotal:    true,
        issRetido:     true,
        issValor:      true,
        valorLiquido:  true,
        autorizadaEm:  true,
        criadoEm:      true,
        spedyId:       true,
        tomadorNome:   true,
        protocolo:     true,
        chamado:  { select: { numero: true, titulo: true } },
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
