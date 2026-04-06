/**
 * GET   /api/crm/clientes/[id]/das-mei  — lista DAS MEI do cliente
 * POST  /api/crm/clientes/[id]/das-mei  — gera DAS manualmente
 * PATCH /api/crm/clientes/[id]/das-mei  — atualiza procuracaoRFAtiva da empresa
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { gerarESalvarDASMEI } from '@/lib/services/das-mei'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  try {
    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: {
        id:      true,
        empresa: {
          select: {
            id:                    true,
            regime:                true,
            procuracaoRFAtiva:     true,
            procuracaoRFVerificadaEm: true,
            dasMeis: {
              orderBy: { competencia: 'desc' },
              take:    24,
            },
          },
        },
      },
    })

    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    return NextResponse.json({
      regime:                   cliente.empresa?.regime ?? null,
      procuracaoRFAtiva:        cliente.empresa?.procuracaoRFAtiva ?? false,
      procuracaoRFVerificadaEm: cliente.empresa?.procuracaoRFVerificadaEm ?? null,
      // Converte Decimal → number para serialização JSON correta
      dasMeis: (cliente.empresa?.dasMeis ?? []).map(d => ({
        ...d,
        valor: d.valor != null ? Number(d.valor) : null,
      })),
    })
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { module: 'api-das-mei', operation: 'GET' },
      extra: { clienteId },
    })
    return NextResponse.json({ error: 'Erro ao buscar DAS MEI' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  try {
    const body = await req.json() as Record<string, unknown>
    const { procuracaoRFAtiva } = body

    if (typeof procuracaoRFAtiva !== 'boolean') {
      return NextResponse.json({ error: 'procuracaoRFAtiva deve ser boolean.' }, { status: 400 })
    }

    // Atualiza na empresa vinculada ao cliente
    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { empresa: { select: { id: true, cnpj: true, razaoSocial: true, regime: true } } },
    })
    if (!cliente?.empresa) {
      return NextResponse.json({ error: 'Cliente sem empresa vinculada.' }, { status: 404 })
    }

    const agora = new Date()
    await prisma.empresa.update({
      where: { id: cliente.empresa.id },
      data:  {
        procuracaoRFAtiva,
        procuracaoRFVerificadaEm: agora,
      },
    })

    // Re-indexa no RAG para que as IAs reflitam o novo status de procuração
    indexarAsync('empresa', {
      id:                       cliente.empresa.id,
      clienteId,
      cnpj:                     cliente.empresa.cnpj,
      razaoSocial:              cliente.empresa.razaoSocial,
      regime:                   cliente.empresa.regime ?? undefined,
      procuracaoRFAtiva,
      procuracaoRFVerificadaEm: agora,
    })

    return NextResponse.json({ ok: true, procuracaoRFAtiva })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags:  { module: 'api-das-mei', operation: 'PATCH-procuracao' },
      extra: { clienteId },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params

  try {
    const body        = await req.json().catch(() => ({})) as Record<string, unknown>
    const competencia = body.competencia as string | undefined

    const das = await gerarESalvarDASMEI(clienteId, competencia)
    return NextResponse.json(das)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags:  { module: 'api-das-mei', operation: 'POST-gerar' },
      extra: { clienteId },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
