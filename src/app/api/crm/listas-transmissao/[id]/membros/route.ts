import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import * as Sentry from '@sentry/nextjs'

const LIMITE_MEMBROS = 50

type Ctx = { params: Promise<{ id: string }> }

/** POST — Adicionar membros à lista */
export async function POST(req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id: listaId } = await ctx.params

  try {
    const body = await req.json()
    const membros: Array<{ clienteId?: string; socioId?: string }> = body.membros
    if (!Array.isArray(membros) || membros.length === 0) {
      return NextResponse.json({ error: 'Envie ao menos um membro' }, { status: 400 })
    }

    // Validar cada membro tem clienteId XOR socioId
    for (const m of membros) {
      if ((!m.clienteId && !m.socioId) || (m.clienteId && m.socioId)) {
        return NextResponse.json({ error: 'Cada membro deve ter clienteId ou socioId (não ambos)' }, { status: 400 })
      }
    }

    // Verificar limite de membros
    const countAtual = await prisma.membroListaTransmissao.count({ where: { listaId } })
    if (countAtual + membros.length > LIMITE_MEMBROS) {
      return NextResponse.json({
        error: `Limite de ${LIMITE_MEMBROS} membros por lista. Atual: ${countAtual}, tentando adicionar: ${membros.length}`,
      }, { status: 400 })
    }

    // Criar membros (skipDuplicates para ignorar duplicatas silenciosamente)
    const resultado = await prisma.membroListaTransmissao.createMany({
      data: membros.map(m => ({
        listaId,
        clienteId: m.clienteId ?? null,
        socioId: m.socioId ?? null,
      })),
      skipDuplicates: true,
    })

    return NextResponse.json({ adicionados: resultado.count }, { status: 201 })
  } catch (err) {
    console.error('[listas-transmissao] erro ao adicionar membros:', err)
    Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'adicionar-membros' }, extra: { listaId } })
    return NextResponse.json({ error: 'Erro ao adicionar membros' }, { status: 500 })
  }
}
