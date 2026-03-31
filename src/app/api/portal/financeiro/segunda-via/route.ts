/**
 * POST /api/portal/financeiro/segunda-via
 *
 * Gera uma nova cobrança (segunda via) para uma cobrança vencida do cliente logado.
 * body: { cobrancaId: string }
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { gerarSegundaVia } from '@/lib/services/asaas-sync'

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

  let body: { cobrancaId: string }
  try {
    body = await req.json() as { cobrancaId: string }
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  // Garante que a cobrança pertence ao cliente logado
  const cobranca = await prisma.cobrancaAsaas.findUnique({
    where:  { id: body.cobrancaId },
    select: { clienteId: true, status: true },
  })

  if (!cobranca || cobranca.clienteId !== clienteId) {
    return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 })
  }

  if (cobranca.status !== 'OVERDUE' && cobranca.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'Segunda via disponível apenas para cobranças pendentes ou vencidas.' },
      { status: 400 },
    )
  }

  const resultado = await gerarSegundaVia(body.cobrancaId)

  return NextResponse.json(resultado, { status: 201 })
}
