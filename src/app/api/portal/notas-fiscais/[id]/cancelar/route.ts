/**
 * POST /api/portal/notas-fiscais/[id]/cancelar — cancela NFS-e autorizada pelo cliente
 *
 * Regras:
 *  - Nota deve pertencer ao clienteId do usuário autenticado
 *  - Status deve ser "autorizada"
 *  - Justificativa obrigatória (mínimo 15 caracteres)
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { cancelarNotaFiscal } from '@/lib/services/notas-fiscais'
import { notificarEquipeNfsCanceladaPeloPortal } from '@/lib/services/nfse/notificacoes'
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

  // Verifica propriedade antes de qualquer operação
  const nota = await prisma.notaFiscal.findUnique({
    where:  { id },
    select: { clienteId: true, status: true, numero: true, valorTotal: true, cliente: { select: { nome: true } } },
  })
  if (!nota) return NextResponse.json({ error: 'Nota fiscal não encontrada' }, { status: 404 })
  if (nota.clienteId !== clienteId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (nota.status !== 'autorizada') {
    return NextResponse.json({ error: `Apenas notas autorizadas podem ser canceladas. Status atual: ${nota.status}` }, { status: 422 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const { justificativa } = body as Record<string, unknown>
  if (!justificativa || typeof justificativa !== 'string' || justificativa.trim().length < 15) {
    return NextResponse.json({ error: 'Justificativa deve ter pelo menos 15 caracteres' }, { status: 400 })
  }

  try {
    const resultado = await cancelarNotaFiscal(id, justificativa.trim())

    if (!resultado.sucesso) {
      return NextResponse.json({ error: resultado.detalhe }, { status: 422 })
    }

    // Notificar equipe — assíncrono
    notificarEquipeNfsCanceladaPeloPortal(
      { id, clienteId, numero: nota.numero, valorTotal: nota.valorTotal },
      nota.cliente?.nome,
    ).catch(err => logger.warn('portal-nfse-cancelar-notificar-equipe-falhou', { err }))

    // Marcar que o cancelamento foi solicitado pelo portal
    await prisma.notaFiscal.update({
      where: { id },
      data:  { solicitadaPeloPortal: true },
    })

    return NextResponse.json({ sucesso: true })

  } catch (err) {
    logger.error('portal-nfse-cancelar-falhou', { notaId: id, clienteId, err })
    Sentry.captureException(err, { tags: { module: 'portal-nfse', operation: 'cancelar' }, extra: { notaId: id, clienteId } })
    return NextResponse.json({ error: 'Erro interno ao cancelar nota fiscal' }, { status: 500 })
  }
}
