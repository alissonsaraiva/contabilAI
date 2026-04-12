/**
 * GET /api/portal/financeiro/limite-mei
 *
 * Retorna o faturamento acumulado do ano via NFS-e para clientes MEI.
 * Usado pelo widget de limite MEI no portal do cliente.
 *
 * Retorna 200 com { regime } (sem dados de limite) para não-MEI.
 */
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { calcularLimiteMEI } from '@/lib/services/limite-mei'
import { resolverEmpresaPrincipalDoObjeto } from '@/lib/ai/tools/resolver-empresa'

export async function GET() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let clienteId: string | null = null
  try {
    clienteId = await resolveClienteId(user)
    if (!clienteId) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })
    }

    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: {
        empresa: { select: { id: true, regime: true } },
        clienteEmpresas: {
          where:   { principal: true },
          select:  { empresa: { select: { id: true, regime: true } } },
          orderBy: { principal: 'desc' as const },
          take:    1,
        },
      },
    })

    // Resolve empresa principal; verifica se é MEI em seguida
    const empPrincipal = resolverEmpresaPrincipalDoObjeto(cliente)

    if (empPrincipal?.regime !== 'MEI') {
      return NextResponse.json({ regime: empPrincipal?.regime ?? null })
    }

    const resultado = await calcularLimiteMEI(empPrincipal.id)
    return NextResponse.json({ regime: 'MEI', ...resultado })
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'api-portal-limite-mei', operation: 'GET' },
      extra: { clienteId },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
