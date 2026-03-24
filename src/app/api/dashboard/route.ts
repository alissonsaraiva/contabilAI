import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const [totalClientes, leadsHoje, aguardandoAssinatura, tarefasVencendo, mrr] =
    await Promise.all([
      prisma.cliente.count({ where: { status: 'ativo' } }),
      prisma.lead.count({ where: { criadoEm: { gte: hoje } } }),
      prisma.contrato.count({ where: { status: 'aguardando_assinatura' } }),
      prisma.tarefa.count({
        where: {
          status: { in: ['pendente', 'em_andamento'] },
          prazo: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.cliente.aggregate({
        where: { status: 'ativo' },
        _sum: { valorMensal: true },
      }),
    ])

  return NextResponse.json({
    totalClientes,
    leadsHoje,
    aguardandoAssinatura,
    tarefasVencendo,
    mrr: Number(mrr._sum.valorMensal ?? 0),
  })
}
