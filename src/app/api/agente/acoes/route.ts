import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const url = new URL(req.url)
  const page    = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1'))
  const limit   = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50'))
  const skip    = (page - 1) * limit

  const solicitante = url.searchParams.get('solicitante') ?? undefined
  const sucesso     = url.searchParams.get('sucesso')
  const tool        = url.searchParams.get('tool')        ?? undefined
  const clienteId   = url.searchParams.get('clienteId')  ?? undefined
  const leadId      = url.searchParams.get('leadId')      ?? undefined

  const where = {
    ...(solicitante && { solicitanteAI: solicitante }),
    ...(sucesso !== null && sucesso !== '' && { sucesso: sucesso === 'true' }),
    ...(tool      && { tool }),
    ...(clienteId && { clienteId }),
    ...(leadId    && { leadId }),
  }

  const [acoes, total] = await Promise.all([
    prisma.agenteAcao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: limit,
      select: {
        id:            true,
        tool:          true,
        sucesso:       true,
        duracaoMs:     true,
        solicitanteAI: true,
        clienteId:     true,
        leadId:        true,
        criadoEm:      true,
        resultado:     true,
        input:         true,
      },
    }),
    prisma.agenteAcao.count({ where }),
  ])

  return NextResponse.json({ acoes, total, page, limit })
}
