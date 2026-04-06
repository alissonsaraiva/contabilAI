/**
 * PATCH /api/crm/clientes/[id]/das-mei/[dasId]
 *
 * Atualização manual de uma DAS MEI (ex: marcar como paga manualmente
 * quando a verificação automática não está disponível).
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; dasId: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId, dasId } = await params

  try {
    const body   = await req.json() as Record<string, unknown>
    const status = body.status as string | undefined

    if (!status || !['pendente', 'paga', 'vencida', 'erro'].includes(status)) {
      return NextResponse.json(
        { error: 'Status inválido. Use: pendente | paga | vencida | erro' },
        { status: 400 },
      )
    }

    // Verifica que o dasId pertence ao clienteId da URL (evita atualizar DAS de outro cliente)
    const dasExistente = await prisma.dasMEI.findFirst({
      where: { id: dasId, clienteId },
    })
    if (!dasExistente) {
      return NextResponse.json({ error: 'DAS não encontrada.' }, { status: 404 })
    }

    const das = await prisma.dasMEI.update({
      where: { id: dasId },
      data:  {
        status:       status as any,
        erroMsg:      status !== 'erro' ? null : undefined,
        atualizadoEm: new Date(),
      },
    })

    return NextResponse.json(das)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags:  { module: 'api-das-mei', operation: 'PATCH' },
      extra: { dasId, clienteId },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
