/**
 * POST /api/crm/clientes/[id]/das-mei/[dasId]/sincronizar
 *
 * Sincroniza manualmente o status de pagamento de uma DAS MEI
 * com o SERPRO (Integra-Pagamento).
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sincronizarPagamentoDAS } from '@/lib/services/das-mei'

type Params = { params: Promise<{ id: string; dasId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId, dasId } = await params

  // Verifica que o dasId pertence ao clienteId da URL
  const dasExistente = await prisma.dasMEI.findFirst({
    where: { id: dasId, clienteId },
  })
  if (!dasExistente) {
    return NextResponse.json({ error: 'DAS não encontrada.' }, { status: 404 })
  }

  try {
    const das = await sincronizarPagamentoDAS(dasId)
    return NextResponse.json(das)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)

    // Módulo integra-pagamento não contratado — retorna 400 em vez de 500
    const isModuloNaoContratado = msg.toLowerCase().includes('módulo') ||
      msg.toLowerCase().includes('modulo') ||
      msg.toLowerCase().includes('não contratado') ||
      msg.toLowerCase().includes('nao contratado')

    if (!isModuloNaoContratado) {
      Sentry.captureException(err, {
        tags:  { module: 'api-das-mei', operation: 'sincronizar' },
        extra: { dasId, clienteId },
      })
    }

    return NextResponse.json(
      { error: isModuloNaoContratado
          ? 'Módulo integra-pagamento não contratado no SERPRO. Verifique as configurações do Integra Contador.'
          : msg,
      },
      { status: isModuloNaoContratado ? 400 : 500 },
    )
  }
}
