/**
 * POST /api/portal/notas-fiscais/[id]/reemitir — reenvia NFS-e rejeitada/erro_interno
 *
 * Regras:
 *  - Nota deve pertencer ao clienteId do usuário autenticado
 *  - Status deve ser "rejeitada" ou "erro_interno"
 *  - Cliente pode corrigir os dados do tomador antes de reemitir
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { reemitirNotaFiscal } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 400 })

  const { id } = await params

  const nota = await prisma.notaFiscal.findUnique({
    where:  { id },
    select: { clienteId: true, status: true },
  })
  if (!nota) return NextResponse.json({ error: 'Nota fiscal não encontrada' }, { status: 404 })
  if (nota.clienteId !== clienteId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (nota.status !== 'rejeitada' && nota.status !== 'erro_interno') {
    return NextResponse.json({ error: `Apenas notas rejeitadas podem ser reemitidas. Status atual: ${nota.status}` }, { status: 422 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const { descricao, valor, tomadorNome, tomadorCpfCnpj, tomadorEmail, tomadorMunicipio, tomadorEstado } = (body ?? {}) as Record<string, unknown>

  // Monta overrides opcionais — campos ausentes = manter dados originais da nota
  const overrides: Record<string, unknown> = {}
  if (descricao        && typeof descricao === 'string')        overrides.descricao        = descricao.trim()
  if (tomadorNome      && typeof tomadorNome === 'string')      overrides.tomadorNome      = tomadorNome.trim()
  if (tomadorCpfCnpj   && typeof tomadorCpfCnpj === 'string')  overrides.tomadorCpfCnpj   = tomadorCpfCnpj
  if (tomadorEmail     && typeof tomadorEmail === 'string')     overrides.tomadorEmail     = tomadorEmail.trim()
  if (tomadorMunicipio && typeof tomadorMunicipio === 'string') overrides.tomadorMunicipio = tomadorMunicipio.trim()
  if (tomadorEstado    && typeof tomadorEstado === 'string')    overrides.tomadorEstado    = tomadorEstado.trim()
  if (valor !== undefined) {
    const valorNum = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
    }
    overrides.valor = valorNum
  }

  try {
    const resultado = await reemitirNotaFiscal(id, Object.keys(overrides).length ? overrides as never : undefined)

    if (!resultado.sucesso) {
      return NextResponse.json({ error: resultado.detalhe }, { status: 422 })
    }

    return NextResponse.json({ notaFiscalId: resultado.notaFiscalId, status: resultado.status })

  } catch (err) {
    logger.error('portal-nfse-reemitir-falhou', { notaId: id, clienteId, err })
    Sentry.captureException(err, { tags: { module: 'portal-nfse', operation: 'reemitir' }, extra: { notaId: id, clienteId } })
    return NextResponse.json({ error: 'Erro interno ao reemitir nota fiscal' }, { status: 500 })
  }
}
