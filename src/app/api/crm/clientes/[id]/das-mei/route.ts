/**
 * GET   /api/crm/clientes/[id]/das-mei              — lista DAS MEI de TODAS as empresas do cliente
 * POST  /api/crm/clientes/[id]/das-mei              — gera DAS manualmente (body: { competencia?, empresaId? })
 * PATCH /api/crm/clientes/[id]/das-mei              — atualiza procuracaoRFAtiva (body: { procuracaoRFAtiva, empresaId? })
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
    // Busca TODAS as empresas vinculadas com DAS (via junção 1:N)
    const vinculos = await prisma.clienteEmpresa.findMany({
      where: { clienteId },
      select: {
        empresaId: true,
        principal: true,
        empresa: {
          select: {
            id:                       true,
            cnpj:                     true,
            razaoSocial:              true,
            nomeFantasia:             true,
            regime:                   true,
            procuracaoRFAtiva:        true,
            procuracaoRFVerificadaEm: true,
            dasMeis: {
              orderBy: { competencia: 'desc' },
              take:    24,
            },
          },
        },
      },
      orderBy: { principal: 'desc' },
    })

    // Fallback: relação legada se junção vazia
    if (vinculos.length === 0) {
      const cliente = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: {
          empresa: {
            select: {
              id: true, cnpj: true, razaoSocial: true, nomeFantasia: true,
              regime: true, procuracaoRFAtiva: true, procuracaoRFVerificadaEm: true,
              dasMeis: { orderBy: { competencia: 'desc' }, take: 24 },
            },
          },
        },
      })
      if (!cliente?.empresa) return NextResponse.json({ empresas: [] })
      const emp = cliente.empresa
      return NextResponse.json({
        empresas: [{
          empresaId:                emp.id,
          principal:                true,
          cnpj:                     emp.cnpj,
          razaoSocial:              emp.razaoSocial,
          nomeFantasia:             emp.nomeFantasia,
          regime:                   emp.regime,
          procuracaoRFAtiva:        emp.procuracaoRFAtiva,
          procuracaoRFVerificadaEm: emp.procuracaoRFVerificadaEm,
          dasMeis: emp.dasMeis.map(d => ({ ...d, valor: d.valor != null ? Number(d.valor) : null })),
        }],
      })
    }

    return NextResponse.json({
      empresas: vinculos.map(v => ({
        empresaId:                v.empresaId,
        principal:                v.principal,
        cnpj:                     v.empresa.cnpj,
        razaoSocial:              v.empresa.razaoSocial,
        nomeFantasia:             v.empresa.nomeFantasia,
        regime:                   v.empresa.regime,
        procuracaoRFAtiva:        v.empresa.procuracaoRFAtiva,
        procuracaoRFVerificadaEm: v.empresa.procuracaoRFVerificadaEm,
        dasMeis: v.empresa.dasMeis.map(d => ({ ...d, valor: d.valor != null ? Number(d.valor) : null })),
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
    const { procuracaoRFAtiva, empresaId: empresaIdInput } = body

    if (typeof procuracaoRFAtiva !== 'boolean') {
      return NextResponse.json({ error: 'procuracaoRFAtiva deve ser boolean.' }, { status: 400 })
    }

    // Resolve empresa: empresaId explícito > relação direta > junção principal
    let empresa: { id: string; cnpj: string | null; razaoSocial: string | null; regime: string | null } | null = null

    if (typeof empresaIdInput === 'string') {
      empresa = await prisma.empresa.findUnique({
        where: { id: empresaIdInput },
        select: { id: true, cnpj: true, razaoSocial: true, regime: true },
      })
    } else {
      const clienteRow = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { empresa: { select: { id: true, cnpj: true, razaoSocial: true, regime: true } } },
      })
      empresa = clienteRow?.empresa ?? null
      if (!empresa) {
        const vinculo = await prisma.clienteEmpresa.findFirst({
          where: { clienteId, principal: true },
          select: { empresa: { select: { id: true, cnpj: true, razaoSocial: true, regime: true } } },
        })
        empresa = vinculo?.empresa ?? null
      }
    }

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })
    }

    const agora = new Date()
    await prisma.empresa.update({
      where: { id: empresa.id },
      data:  { procuracaoRFAtiva, procuracaoRFVerificadaEm: agora },
    })

    indexarAsync('empresa', {
      id:                       empresa.id,
      clienteId,
      cnpj:                     empresa.cnpj,
      razaoSocial:              empresa.razaoSocial,
      regime:                   empresa.regime ?? undefined,
      procuracaoRFAtiva,
      procuracaoRFVerificadaEm: agora,
    })

    return NextResponse.json({ ok: true, procuracaoRFAtiva, empresaId: empresa.id })
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
    const empresaId   = body.empresaId  as string | undefined

    const das = await gerarESalvarDASMEI(clienteId, competencia, empresaId)
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
