import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const createSchema = z.object({
  titulo: z.string().min(3, 'Título muito curto'),
  descricao: z.string().optional(),
  prioridade: z.enum(['baixa', 'media', 'alta', 'urgente']).default('media'),
  prazo: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { prazo, clienteId, ...rest } = parsed.data

  const tarefa = await prisma.tarefa.create({
    data: {
      ...rest,
      prazo: prazo ? new Date(prazo) : undefined,
      clienteId: clienteId || undefined,
      responsavelId: (session.user as any).id,
    },
  })

  import('@/lib/rag/ingest').then(({ indexarTarefa }) => indexarTarefa(tarefa)).catch(() => {})

  return NextResponse.json(tarefa, { status: 201 })
}
