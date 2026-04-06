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

    // Guarda explícito: empresa pode ser null (empresaId é FK opcional)
    if (!cliente.empresa || cliente.empresa.regime !== 'MEI') {
      return NextResponse.json({ regime: cliente.empresa?.regime ?? null })
    }

    const resultado = await calcularLimiteMEI(cliente.empresa.id)
    return NextResponse.json({ regime: 'MEI', ...resultado })
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'api-crm-limite-mei', operation: 'GET' },
      extra: { clienteId: (await params).id },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
