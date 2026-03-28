import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

/** PATCH — toggle portalAccess de um sócio */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { portalAccess } = await req.json() as { portalAccess: boolean }

  if (typeof portalAccess !== 'boolean') {
    return NextResponse.json({ error: 'portalAccess deve ser boolean' }, { status: 400 })
  }

  const socio = await prisma.socio.findUnique({
    where:  { id },
    select: { id: true, email: true, portalAccess: true },
  })

  if (!socio) return NextResponse.json({ error: 'Sócio não encontrado' }, { status: 404 })

  if (!portalAccess && socio.portalAccess) {
    // Ao desabilitar, invalida tokens ativos do sócio
    await prisma.portalToken.deleteMany({ where: { socioId: id } })
  }

  const atualizado = await prisma.socio.update({
    where: { id },
    data:  { portalAccess },
    select: { id: true, nome: true, email: true, portalAccess: true },
  })

  return NextResponse.json(atualizado)
}
