import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

const createSchema = z.object({
  clienteId:  z.string().uuid().optional(),
  leadId:     z.string().uuid().optional(),
  tipo: z.enum([
    'whatsapp_enviado', 'email_enviado', 'ligacao', 'nota_interna',
    'status_mudou', 'contrato_gerado', 'contrato_assinado',
    'documento_enviado', 'tarefa_criada', 'cliente_ativado',
  ]),
  titulo:    z.string().optional(),
  conteudo:  z.string().optional(),
  metadados: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (!parsed.data.clienteId && !parsed.data.leadId) {
    return NextResponse.json({ error: 'clienteId ou leadId obrigatório' }, { status: 400 })
  }

  const { clienteId, leadId, ...rest } = parsed.data
  const interacao = await prisma.interacao.create({
    data: {
      ...rest,
      usuarioId: (session.user as any).id,
      ...(clienteId ? { clienteId } : {}),
      ...(leadId    ? { leadId }    : {}),
    } as any,
  })

  // Indexa a interação no RAG em background
  import('@/lib/rag/ingest')
    .then(({ indexarInteracao }) => indexarInteracao({ ...interacao, criadoEm: interacao.criadoEm }))
    .catch(() => {})

  return NextResponse.json(interacao, { status: 201 })
}
