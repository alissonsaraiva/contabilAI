import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const [totalClientes, leadsHoje, aguardandoAssinatura, inadimplentes, mrr] =
    await Promise.all([
      prisma.cliente.count({ where: { status: 'ativo' } }),
      prisma.lead.count({ where: { criadoEm: { gte: hoje } } }),
      prisma.contrato.count({ where: { status: 'aguardando_assinatura' } }),
      prisma.cliente.count({ where: { status: 'inadimplente' } }),
      prisma.cliente.aggregate({
        where: { status: 'ativo' },
        _sum: { valorMensal: true },
      }),
    ])

  return NextResponse.json({
    totalClientes,
    leadsHoje,
    aguardandoAssinatura,
    inadimplentes,
    mrr: Number(mrr._sum.valorMensal ?? 0),
  })
}
