import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'

type Params = { params: Promise<{ id: string }> }

function gerarSenhaAleatoria(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#'
  const array = new Uint8Array(12)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => chars[b % chars.length]).join('')
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem resetar senhas' }, { status: 403 })
  }

  const { id } = await params

  const senhaGerada = gerarSenhaAleatoria()
  const senhaHash = await bcrypt.hash(senhaGerada, 12)

  const usuario = await prisma.usuario.update({
    where: { id },
    data: { senhaHash, precisaTrocarSenha: true },
    select: { id: true, nome: true, email: true },
  })

  return NextResponse.json({ ...usuario, senhaGerada })
}
