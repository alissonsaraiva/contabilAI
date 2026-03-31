/**
 * POST /api/crm/clientes/[id]/cobrancas/[cobrancaId]/segunda-via
 *
 * Gera uma nova cobrança no Asaas (vencimento em 3 dias) para uma cobrança vencida.
 * Não altera a cobrança original — cria uma nova e devolve os dados de pagamento.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { gerarSegundaVia } from '@/lib/services/asaas-sync'

type Params = { params: Promise<{ id: string; cobrancaId: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cobrancaId } = await params

  const cobranca = await prisma.cobrancaAsaas.findUnique({
    where:  { id: cobrancaId },
    select: { status: true, clienteId: true },
  })

  if (!cobranca) {
    return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 })
  }

  if (cobranca.status !== 'OVERDUE' && cobranca.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'Só é possível gerar segunda via de cobranças pendentes ou vencidas.' },
      { status: 400 },
    )
  }

  const resultado = await gerarSegundaVia(cobrancaId)

  return NextResponse.json(resultado, { status: 201 })
}
