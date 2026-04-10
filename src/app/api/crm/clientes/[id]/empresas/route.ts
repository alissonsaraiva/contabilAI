/**
 * POST /api/crm/clientes/[id]/empresas
 * Body: { cnpj?: string; razaoSocial?: string; nomeFantasia?: string; regime?: string }
 *
 * Cria uma nova empresa e vincula ao cliente (via ClienteEmpresa + legado).
 * Se o cliente não tem nenhuma empresa ainda, a nova vira principal.
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { vincularEmpresa } from '@/lib/clientes/vincular-empresa'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: clienteId } = await params
  const body = await req.json()

  const cnpj         = typeof body.cnpj         === 'string' ? body.cnpj.trim()         || null : null
  const razaoSocial  = typeof body.razaoSocial  === 'string' ? body.razaoSocial.trim()  || null : null
  const nomeFantasia = typeof body.nomeFantasia === 'string' ? body.nomeFantasia.trim() || null : null
  const regime       = typeof body.regime       === 'string' ? body.regime               || null : null

  if (!cnpj && !razaoSocial) {
    return NextResponse.json({ error: 'CNPJ ou Razão Social obrigatório' }, { status: 400 })
  }

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, empresaId: true },
    })
    if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

    // Verifica se é a primeira empresa (vira principal)
    const existentes = await prisma.clienteEmpresa.count({ where: { clienteId } })
    const isPrimeira = existentes === 0

    const resultado = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          ...(cnpj         && { cnpj }),
          ...(razaoSocial  && { razaoSocial }),
          ...(nomeFantasia && { nomeFantasia }),
          ...(regime       && { regime: regime as any }),
        },
      })

      await vincularEmpresa(tx, clienteId, empresa.id, isPrimeira)

      // Se primeira empresa e cliente era PF com CNPJ, converte para PJ
      if (isPrimeira && cnpj) {
        await tx.cliente.update({ where: { id: clienteId }, data: { tipoContribuinte: 'pj' } })
      }

      return empresa
    })

    indexarAsync('empresa', {
      id:           resultado.id,
      clienteId,
      cnpj:         resultado.cnpj,
      razaoSocial:  resultado.razaoSocial,
      nomeFantasia: resultado.nomeFantasia,
      regime:       resultado.regime,
      socios:       [],
    })

    return NextResponse.json({ ok: true, empresaId: resultado.id, principal: isPrimeira })
  } catch (err) {
    console.error('[crm/clientes/empresas] Erro ao adicionar empresa:', { clienteId, err })
    Sentry.captureException(err, {
      tags:  { module: 'crm-clientes', operation: 'adicionar-empresa' },
      extra: { clienteId, cnpj },
    })
    return NextResponse.json({ error: 'Erro ao adicionar empresa' }, { status: 500 })
  }
}
