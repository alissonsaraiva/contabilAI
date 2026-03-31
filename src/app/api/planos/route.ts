import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { indexarAsync } from '@/lib/rag/indexar-async'

const createSchema = z.object({
  tipo: z.enum(['essencial', 'profissional', 'empresarial', 'startup']),
  nome: z.string().min(2),
  descricao: z.string().optional(),
  valorMinimo: z.coerce.number().positive(),
  valorMaximo: z.coerce.number().positive(),
  servicos: z.array(z.string()).default([]),
  destaque: z.boolean().default(false),
  ativo: z.boolean().default(true),
})

export async function GET() {
  const planos = await prisma.plano.findMany({ orderBy: { valorMinimo: 'asc' } })
  return NextResponse.json(planos)
}

export async function POST(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const plano = await prisma.plano.create({ data: parsed.data })
  indexarAsync('planos', null)
  return NextResponse.json(plano, { status: 201 })
}
