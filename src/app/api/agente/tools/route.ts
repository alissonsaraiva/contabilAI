/**
 * GET  /api/agente/tools  — lista todas as tools com status habilitado/desabilitado
 * PUT  /api/agente/tools  — salva a lista de tools desabilitadas
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
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const row = await prisma.escritorio.findFirst({
    select: { toolsDesabilitadas: true },
  })

  const desabilitadas: string[] = Array.isArray(row?.toolsDesabilitadas)
    ? (row.toolsDesabilitadas as string[])
    : []

  const capacidades = getCapacidades().map(c => ({
    ...c,
    habilitada: !desabilitadas.includes(c.tool),
  }))

  return NextResponse.json({ capacidades, desabilitadas })
}

export async function PUT(req: Request) {
  const session = await auth()
  const tipo = (session?.user as Record<string, unknown>)?.tipo as string | undefined
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Apenas admins podem alterar tools' }, { status: 403 })
  }

  const body = await req.json() as { desabilitadas: string[] }
  const desabilitadas = Array.isArray(body.desabilitadas) ? body.desabilitadas : []

  const row = await prisma.escritorio.findFirst({ select: { id: true } })
  if (!row) return NextResponse.json({ error: 'Escritório não encontrado' }, { status: 404 })

  await prisma.escritorio.update({
    where: { id: row.id },
    data:  { toolsDesabilitadas: desabilitadas },
  })

  invalidateAiConfigCache()

  return NextResponse.json({ ok: true, desabilitadas })
}
