import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const patchSchema = z.object({
  status: z.enum(['pendente', 'em_andamento', 'aguardando_cliente', 'concluida', 'cancelada']).optional(),
  titulo: z.string().min(3).optional(),
  descricao: z.string().optional().nullable(),
  prioridade: z.enum(['baixa', 'media', 'alta', 'urgente']).optional(),
  prazo: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { status, prazo, clienteId, ...rest } = parsed.data

  const tarefa = await prisma.tarefa.update({
    where: { id },
    data: {
      ...rest,
      ...(status !== undefined && {
        status,
        concluidaEm: status === 'concluida' ? new Date() : null,
      }),
      ...(prazo !== undefined && { prazo: prazo ? new Date(prazo) : null }),
      ...(clienteId !== undefined && { clienteId: clienteId || null }),
    },
  })

  import('@/lib/rag/ingest').then(({ indexarTarefa }) => indexarTarefa(tarefa)).catch(() => {})

  return NextResponse.json(tarefa)
}
