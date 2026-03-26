import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ count: 0 })
  }

  const count = await prisma.escalacao.count({
    where: { status: 'pendente' },
  })

  return NextResponse.json({ count })
}
