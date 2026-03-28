import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'

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

  indexarAsync('empresa', {
    id:          empresa.id,
    cnpj:        empresa.cnpj,
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    regime:      empresa.regime,
    status:      empresa.status,
    socios:      empresa.socios,
  })

  return NextResponse.json(empresa)
}
