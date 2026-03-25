import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const schema = z.object({
  novaSenha: z.string().min(6, 'Mínimo 6 caracteres'),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const id = (session.user as any)?.id
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const senhaHash = await bcrypt.hash(parsed.data.novaSenha, 12)
  await prisma.usuario.update({
    where: { id },
    data: { senhaHash, precisaTrocarSenha: false },
  })

  return NextResponse.json({ ok: true })
}
