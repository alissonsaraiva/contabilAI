import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const createSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório'),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha mínima de 6 caracteres'),
  tipo: z.enum(['admin', 'contador', 'assistente']).default('assistente'),
})

export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const usuarios = await prisma.usuario.findMany({
    orderBy: { criadoEm: 'desc' },
    select: { id: true, nome: true, email: true, tipo: true, ativo: true, avatar: true, criadoEm: true },
  })

  return NextResponse.json(usuarios)
}

export async function POST(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem criar usuários' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const senhaHash = await bcrypt.hash(parsed.data.senha, 12)

  try {
    const usuario = await prisma.usuario.create({
      data: {
        nome: parsed.data.nome,
        email: parsed.data.email,
        senhaHash,
        tipo: parsed.data.tipo,
      },
      select: { id: true, nome: true, email: true, tipo: true, ativo: true, criadoEm: true },
    })
    return NextResponse.json(usuario, { status: 201 })
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 })
    }
    throw e
  }
}
