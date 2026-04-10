/**
 * GET /api/crm/clientes/[id]/limite-mei
 *
 * Retorna o faturamento acumulado do ano via NFS-e para um cliente MEI.
 * Usado pelo widget de limite MEI na aba financeiro do CRM.
 *
 * Retorna 200 com { regime } (sem dados de limite) para não-MEI.
 */
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calcularLimiteMEI } from '@/lib/services/limite-mei'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id: clienteId } = await params

    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { empresa: { select: { id: true, regime: true } } },
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    // Resolve empresa MEI: relação direta → fallback junção 1:N (busca qualquer MEI)
    let empresa = cliente.empresa
    if (!empresa || empresa.regime !== 'MEI') {
      const vinculo = await prisma.clienteEmpresa.findFirst({
        where: { clienteId, empresa: { regime: 'MEI' } },
        select: { empresa: { select: { id: true, regime: true } } },
      })
      if (vinculo?.empresa) empresa = vinculo.empresa
    }

    if (!empresa || empresa.regime !== 'MEI') {
      return NextResponse.json({ regime: empresa?.regime ?? null })
    }

    const resultado = await calcularLimiteMEI(empresa.id)
    return NextResponse.json({ regime: 'MEI', ...resultado })
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'api-crm-limite-mei', operation: 'GET' },
      extra: { clienteId: (await params).id },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
