import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { enviarEmailComHistorico } from '@/lib/email/com-historico'
import { z } from 'zod'

const schema = z.object({
  clienteId: z.string().uuid().optional(),
  leadId:    z.string().uuid().optional(),
  para:      z.string().email(),
  assunto:   z.string().min(1),
  corpo:     z.string().min(1),
  // Anexos referenciando documentos já existentes no banco
  anexos: z.array(z.object({
    documentoId: z.string().uuid().optional(),  // documento existente
    nome:        z.string(),
    url:         z.string().url(),
    mimeType:    z.string().optional(),
  })).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { clienteId, leadId, para, assunto, corpo, anexos } = parsed.data
  const usuarioId = (session.user as any).id as string | undefined

  const resultado = await enviarEmailComHistorico({
    para,
    assunto,
    corpo,
    clienteId,
    leadId,
    usuarioId,
    origem: 'usuario',
    anexos: anexos?.map(a => ({ nome: a.nome, url: a.url, mimeType: a.mimeType })),
    metadados: {
      anexos: anexos?.map(a => ({ nome: a.nome, url: a.url, mimeType: a.mimeType })) ?? [],
    },
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 500 })
  }

  return NextResponse.json({ ok: true, messageId: resultado.messageId })
}
