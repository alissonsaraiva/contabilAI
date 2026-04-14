/**
 * PATCH /api/email/inbox/[id]/atribuir
 * Atribui (ou remove atribuição de) um email/thread a um operador.
 * Quando o email faz parte de uma thread (emailThreadId preenchido), atualiza
 * todos os emails da mesma thread — mantém consistência visual.
 *
 * Body: { operadorId: string | null }
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

  if (!('operadorId' in body)) {
    return NextResponse.json({ error: 'Campo operadorId é obrigatório' }, { status: 400 })
  }

  const operadorId = body.operadorId ?? null

  try {
    // Valida operador
    if (operadorId !== null) {
      const operador = await prisma.usuario.findUnique({
        where:  { id: operadorId, ativo: true },
        select: { id: true },
      })
      if (!operador) return NextResponse.json({ error: 'Operador não encontrado' }, { status: 404 })
    }

    // Busca o email para obter o threadId
    const interacao = await prisma.interacao.findFirst({
      where:  { id, tipo: { in: ['email_recebido', 'email_enviado'] } },
      select: { id: true, emailThreadId: true },
    })
    if (!interacao) return NextResponse.json({ error: 'E-mail não encontrado' }, { status: 404 })

    const data = {
      atribuidaParaId: operadorId,
      atribuidaEm:     operadorId ? new Date() : null,
    }

    if (interacao.emailThreadId) {
      // Atualiza todos os emails da thread
      await prisma.interacao.updateMany({
        where: {
          emailThreadId: interacao.emailThreadId,
          tipo: { in: ['email_recebido', 'email_enviado'] },
        },
        data,
      })
    } else {
      // Email avulso (sem thread)
      await prisma.interacao.update({ where: { id }, data })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'email-atribuir', operation: 'patch' },
      extra: { interacaoId: id, operadorId },
    })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
