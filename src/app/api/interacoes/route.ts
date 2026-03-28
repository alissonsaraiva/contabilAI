import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { registrarInteracao } from '@/lib/services/interacoes'
import { z } from 'zod'

const createSchema = z.object({
  clienteId:  z.string().uuid().optional(),
  leadId:     z.string().uuid().optional(),
  tipo:       z.string().min(1),  // string livre — veja TipoEvento em src/lib/historico.ts
  titulo:     z.string().optional(),
  conteudo:   z.string().optional(),
  metadados:  z.record(z.string(), z.unknown()).optional(),
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

  const { clienteId, leadId, tipo, titulo, conteudo, metadados } = parsed.data
  const usuarioId = (session.user as any).id as string | undefined

  const id = await registrarInteracao({
    clienteId,
    leadId,
    tipo:      tipo as never,
    titulo,
    conteudo,
    origem:    'usuario',
    usuarioId,
    metadados,
  })

  return NextResponse.json({ id }, { status: 201 })
}
