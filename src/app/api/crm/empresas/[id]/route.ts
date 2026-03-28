import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const empresa = await prisma.empresa.update({
    where: { id },
    data: {
      cnpj: body.cnpj || null,
      razaoSocial: body.razaoSocial || null,
      nomeFantasia: body.nomeFantasia || null,
      regime: body.regime || null,
      status: body.status || undefined,
    },
    include: { cliente: true, socios: true },
  })

  return NextResponse.json(empresa)
}
