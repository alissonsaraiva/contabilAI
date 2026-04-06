/**
 * GET /api/portal/financeiro/das-mei
 *
 * Retorna as DAS MEI do cliente logado (últimas 24 competências).
 * Só retorna dados se o cliente for MEI.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'

export async function GET() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 400 })

  // Verifica se o cliente é MEI
  const cliente = await prisma.cliente.findUnique({
    where:  { id: clienteId },
    select: {
      empresa: {
        select: {
          regime:    true,
          dasMeis: {
            orderBy: { competencia: 'desc' },
            take:    24,
            select: {
              id:             true,
              competencia:    true,
              valor:          true,
              dataVencimento: true,
              codigoBarras:   true,
              urlDas:         true,
              status:         true,
              criadoEm:       true,
              // Não expõe erroMsg nem raw para o portal
            },
          },
        },
      },
    },
  })

  if (cliente?.empresa?.regime !== 'MEI') {
    return NextResponse.json({ regime: cliente?.empresa?.regime ?? null, dasMeis: [] })
  }

  return NextResponse.json({
    regime: 'MEI',
    dasMeis: (cliente.empresa.dasMeis ?? []).map(d => ({
      ...d,
      valor: d.valor != null ? Number(d.valor) : null,
    })),
  })
}
