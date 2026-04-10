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

  // Busca empresa ativa da sessão (não a relação 1:1 legada)
  const empresaId = user.empresaId as string | undefined
  if (!empresaId) return NextResponse.json({ regime: null, dasMeis: [] })

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      regime: true,
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
        },
      },
    },
  })

  if (empresa?.regime !== 'MEI') {
    return NextResponse.json({ regime: empresa?.regime ?? null, dasMeis: [] })
  }

  return NextResponse.json({
    regime: 'MEI',
    dasMeis: (empresa.dasMeis ?? []).map(d => ({
      ...d,
      valor: d.valor != null ? Number(d.valor) : null,
    })),
  })
}
