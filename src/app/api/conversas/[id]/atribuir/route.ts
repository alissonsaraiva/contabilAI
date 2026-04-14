/**
 * PATCH /api/conversas/[id]/atribuir
 * Atribui (ou remove atribuição de) uma conversa a um operador.
 *
 * Body: { operadorId: string | null }
 *   - string  → atribui ao operador informado
 *   - null    → remove atribuição (conversa volta a ser "não atribuída")
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import * as Sentry from '@sentry/nextjs'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  let body: { operadorId?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  // operadorId ausente no body é diferente de operadorId: null (remoção intencional)
  if (!('operadorId' in body)) {
    return NextResponse.json({ error: 'Campo operadorId é obrigatório' }, { status: 400 })
  }

  const operadorId = body.operadorId ?? null

  try {
    // Valida que o operador existe (quando não é remoção)
    if (operadorId !== null) {
      const operador = await prisma.usuario.findUnique({
        where:  { id: operadorId, ativo: true },
        select: { id: true, nome: true },
      })
      if (!operador) return NextResponse.json({ error: 'Operador não encontrado' }, { status: 404 })
    }

    const conversa = await prisma.conversaIA.findUnique({
      where:  { id },
      select: { id: true },
    })
    if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

    await prisma.conversaIA.update({
      where: { id },
      data: {
        atribuidaParaId: operadorId,
        atribuidaEm:     operadorId ? new Date() : null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'conversas-atribuir', operation: 'patch' },
      extra: { conversaId: id, operadorId },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
