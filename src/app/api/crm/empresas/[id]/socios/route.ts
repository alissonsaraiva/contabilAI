import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: empresaId } = await params

  try {
    const empresa = await prisma.empresa.findUnique({
      where:  { id: empresaId },
      select: { id: true },
    })
    if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })

    const body = await req.json()
    const { nome, cpf, qualificacao, participacao, email, telefone, whatsapp, principal } = body

    if (!nome?.trim()) return NextResponse.json({ error: 'nome obrigatório' }, { status: 400 })
    if (!cpf?.trim())  return NextResponse.json({ error: 'cpf obrigatório'  }, { status: 400 })

    // Se marcado como principal, desmarca os outros
    if (principal) {
      await prisma.socio.updateMany({
        where: { empresaId, principal: true },
        data:  { principal: false },
      })
    }

    const socio = await prisma.socio.create({
      data: {
        empresaId,
        nome:         nome.trim(),
        cpf:          cpf.replace(/\D/g, ''),
        qualificacao: qualificacao?.trim() || null,
        participacao: participacao ? Number(participacao) : null,
        email:        email?.trim()     || null,
        telefone:     telefone?.trim()  || null,
        whatsapp:     whatsapp?.trim()  || null,
        principal:    !!principal,
      },
    })

    // Reindexar empresa no RAG
    const empresaCompleta = await prisma.empresa.findUnique({
      where:   { id: empresaId },
      include: { socios: true, cliente: { select: { id: true } } },
    })
    if (empresaCompleta) {
      indexarAsync('empresa', {
        id:           empresaCompleta.id,
        clienteId:    empresaCompleta.cliente?.id ?? null,
        cnpj:         empresaCompleta.cnpj,
        razaoSocial:  empresaCompleta.razaoSocial,
        nomeFantasia: empresaCompleta.nomeFantasia,
        regime:       empresaCompleta.regime,
        socios:       empresaCompleta.socios,
      })
    }

    return NextResponse.json(socio, { status: 201 })
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm-socios', operation: 'create' }, extra: { empresaId } })
    return NextResponse.json({ error: 'Erro ao criar sócio' }, { status: 500 })
  }
}
