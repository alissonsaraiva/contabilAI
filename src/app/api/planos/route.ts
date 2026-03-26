import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'

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
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const plano = await prisma.plano.create({ data: parsed.data })
    import('@/lib/rag/ingest').then(({ indexarPlanos }) => indexarPlanos()).catch(() => {})
    return NextResponse.json(plano, { status: 201 })
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe um plano com este tipo' }, { status: 409 })
    }
    throw e
  }
}
