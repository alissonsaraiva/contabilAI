import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'

export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  const autenticado = session && (tipo === 'admin' || tipo === 'contador')

  const escritorio = await prisma.escritorio.findFirst()

  if (!autenticado) {
    // Apenas campos públicos — onboarding, portal e site podem ler isso
    return NextResponse.json({
      nome:            escritorio?.nome,
      nomeFantasia:    escritorio?.nomeFantasia,
      logoUrl:         escritorio?.logoUrl,
      faviconUrl:      escritorio?.faviconUrl,
      fraseBemVindo:   escritorio?.fraseBemVindo,
      metaDescricao:   escritorio?.metaDescricao,
      email:           escritorio?.email,
      telefone:        escritorio?.telefone,
      whatsapp:        escritorio?.whatsapp,
      cidade:          escritorio?.cidade,
      uf:              escritorio?.uf,
      vencimentosDias: escritorio?.vencimentosDias,
      pixDescontoPercent: escritorio?.pixDescontoPercent,
    })
  }

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

  indexarAsync('escritorio', escritorio)
  indexarAsync('planos', null)

  return NextResponse.json(escritorio)
}
