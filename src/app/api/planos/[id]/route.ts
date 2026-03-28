import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  nome: z.string().min(2).optional(),
  descricao: z.string().optional().nullable(),
  valorMinimo: z.coerce.number().positive().optional(),
  valorMaximo: z.coerce.number().positive().optional(),
  servicos: z.array(z.string()).optional(),
  destaque: z.boolean().optional(),
  ativo: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const plano = await prisma.plano.update({ where: { id }, data: parsed.data })
  indexarAsync('planos', null)
  return NextResponse.json(plano)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem excluir planos' }, { status: 403 })
  }

  const { id } = await params
  await prisma.plano.delete({ where: { id } })

  // Re-indexa base de planos sem o plano deletado
  indexarAsync('planos', null)

  return NextResponse.json({ ok: true })
}
