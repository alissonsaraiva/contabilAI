/**
 * GET  /api/agente/tools  — lista todas as tools com status habilitado/desabilitado e canais efetivos
 * PUT  /api/agente/tools  — salva a lista de tools desabilitadas e overrides de canais
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { invalidateAiConfigCache } from '@/lib/ai/config'
import '@/lib/ai/tools' // efeito colateral: registra todas as tools no registry
import { getCapacidades } from '@/lib/ai/tools/registry'

export async function GET() {
  const session = await auth()
  const tipo = (session?.user as Record<string, unknown>)?.tipo as string | undefined
  if (!session || (tipo !== 'admin')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const row = await prisma.escritorio.findFirst({
    select: { toolsDesabilitadas: true, toolsCanaisOverride: true },
  })

  const desabilitadas: string[] = Array.isArray(row?.toolsDesabilitadas)
    ? (row.toolsDesabilitadas as string[])
    : []

  const canaisOverride: Record<string, string[]> =
    row?.toolsCanaisOverride && typeof row.toolsCanaisOverride === 'object' && !Array.isArray(row.toolsCanaisOverride)
      ? (row.toolsCanaisOverride as Record<string, string[]>)
      : {}

  const capacidades = getCapacidades().map(c => ({
    ...c,
    habilitada: !desabilitadas.includes(c.tool),
    canaisEfetivos: canaisOverride[c.tool] ?? c.canais,
  }))

  return NextResponse.json({ capacidades, desabilitadas, canaisOverride })
}

export async function PUT(req: Request) {
  const session = await auth()
  const tipo = (session?.user as Record<string, unknown>)?.tipo as string | undefined
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Apenas admins podem alterar tools' }, { status: 403 })
  }

  const body = await req.json() as { desabilitadas?: string[]; canaisOverride?: Record<string, string[]> }
  const desabilitadas = Array.isArray(body.desabilitadas) ? body.desabilitadas : []
  const canaisOverride =
    body.canaisOverride && typeof body.canaisOverride === 'object' && !Array.isArray(body.canaisOverride)
      ? body.canaisOverride
      : {}

  const row = await prisma.escritorio.findFirst({ select: { id: true } })
  if (!row) return NextResponse.json({ error: 'Escritório não encontrado' }, { status: 404 })

  await prisma.escritorio.update({
    where: { id: row.id },
    data: {
      toolsDesabilitadas: desabilitadas,
      toolsCanaisOverride: canaisOverride,
    },
  })

  invalidateAiConfigCache()

  return NextResponse.json({ ok: true, desabilitadas, canaisOverride })
}
