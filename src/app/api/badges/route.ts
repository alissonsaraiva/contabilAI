import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const revalidate = 0

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const [escalacoes, emails, chamados] = await Promise.all([
    prisma.escalacao.count({ where: { status: 'pendente' } }).catch(() => 0),
    prisma.interacao.count({ where: { tipo: 'email_recebido', respondidoEm: null } }).catch(() => 0),
    prisma.chamado.count({ where: { status: 'aberta' } }).catch(() => 0),
  ])

  return NextResponse.json({ escalacoes, emails, chamados })
}
