import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

type Params = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  tipo: z.enum(['admin', 'contador', 'assistente']).optional(),
  ativo: z.boolean().optional(),
  nome: z.string().min(2).optional(),
  email: z.string().email().optional(),
  senha: z.string().min(6).optional(),
  whatsapp: z.string().optional().nullable(),
})

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  const tipoUsuario = (session?.user as any)?.tipo
  if (!session || tipoUsuario !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem editar usuários' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { senha, ...rest } = parsed.data
  const data: Record<string, unknown> = { ...rest }
  if (senha) data.senhaHash = await bcrypt.hash(senha, 12)

  const usuario = await prisma.usuario.update({
    where: { id },
    data,
    select: { id: true, nome: true, email: true, tipo: true, ativo: true, whatsapp: true, criadoEm: true },
  })

  return NextResponse.json(usuario)
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  const tipoUsuario = (session?.user as any)?.tipo
  if (!session || tipoUsuario !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem excluir usuários' }, { status: 403 })
  }

  const { id } = await params
  const sessionId = (session?.user as any)?.id
  if (id === sessionId) {
    return NextResponse.json({ error: 'Você não pode excluir sua própria conta' }, { status: 400 })
  }

  await prisma.usuario.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
