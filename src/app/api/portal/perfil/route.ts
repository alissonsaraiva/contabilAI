import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { z } from 'zod'

const updateSchema = z.object({
  email:       z.string().email().optional(),
  estadoCivil: z.string().optional().nullable(),
  telefone:    z.string().min(8).optional(),
  whatsapp:    z.string().optional().nullable(),
  cep:         z.string().optional().nullable(),
  logradouro:  z.string().optional().nullable(),
  numero:      z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro:      z.string().optional().nullable(),
  cidade:      z.string().optional().nullable(),
  uf:          z.string().max(2).optional().nullable(),
})

export async function PATCH(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const body   = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Remove keys com undefined para não sobrescrever com null acidentalmente
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  )

  await prisma.cliente.update({ where: { id: clienteId }, data })

  return NextResponse.json({ ok: true })
}
