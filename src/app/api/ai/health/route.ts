import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAiHealth, getFallbackEvents } from '@/lib/ai/health-cache'
import { prisma } from '@/lib/prisma'

const CIRCUIT_BREAK_MS = 2 * 60 * 1000

export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const health = getAiHealth()
  const events = getFallbackEvents()

  // Enriquece cada provider com estado do circuit breaker
  const providers = Object.entries(health).map(([name, status]) => {
    const circuitOpen = status.checkedAt > 0 && !status.ok && (Date.now() - status.checkedAt) < CIRCUIT_BREAK_MS
    const resetsAt    = circuitOpen ? status.checkedAt + CIRCUIT_BREAK_MS : null
    return { name, ...status, circuitOpen, resetsAt }
  })

  // Stats do agente: últimas 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [totalAcoes, sucessos, toolStats] = await Promise.all([
    prisma.agenteAcao.count({ where: { criadoEm: { gte: since } } }),
    prisma.agenteAcao.count({ where: { criadoEm: { gte: since }, sucesso: true } }),
    prisma.agenteAcao.groupBy({
      by: ['tool'],
      where: { criadoEm: { gte: since } },
      _count: { tool: true },
      _avg:   { duracaoMs: true },
      orderBy: { _count: { tool: 'desc' } },
    }),
  ])

  return NextResponse.json({
    providers,
    fallbackEvents: events.slice(0, 50),
    stats: {
      totalAcoes24h:  totalAcoes,
      sucessos24h:    sucessos,
      taxaSucesso:    totalAcoes > 0 ? Math.round((sucessos / totalAcoes) * 100) : null,
      tools:          toolStats.map(t => ({
        tool:      t.tool,
        count:     t._count.tool,
        avgMs:     Math.round(t._avg.duracaoMs ?? 0),
      })),
    },
  })
}
