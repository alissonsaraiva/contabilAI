import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const escritorio = await prisma.escritorio.findFirst()
  return NextResponse.json(escritorio)
}

export async function PUT(req: Request) {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const escritorio = await prisma.escritorio.upsert({
    where: { id: 'singleton' },
    update: { ...body, atualizadoEm: new Date() },
    create: { id: 'singleton', ...body },
  })

  return NextResponse.json(escritorio)
}
