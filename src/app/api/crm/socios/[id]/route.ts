import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const socio = await prisma.socio.findUnique({
      where:  { id },
      select: { id: true, empresaId: true },
    })
    if (!socio) return NextResponse.json({ error: 'Sócio não encontrado' }, { status: 404 })

    const body = await req.json()
    const { nome, cpf, qualificacao, participacao, email, telefone, whatsapp, principal } = body

    if (nome !== undefined && !nome?.trim()) {
      return NextResponse.json({ error: 'nome não pode ser vazio' }, { status: 400 })
    }

    // Se marcado como principal, desmarca os outros da mesma empresa
    if (principal) {
      await prisma.socio.updateMany({
        where: { empresaId: socio.empresaId, principal: true, id: { not: id } },
        data:  { principal: false },
      })
    }

    const data: Record<string, unknown> = {}
    if (nome         !== undefined) data.nome         = nome.trim()
    if (cpf          !== undefined) data.cpf          = cpf.replace(/\D/g, '')
    if (qualificacao !== undefined) data.qualificacao = qualificacao?.trim() || null
    if (participacao !== undefined) data.participacao = participacao !== null ? Number(participacao) : null
    if (email        !== undefined) data.email        = email?.trim()    || null
    if (telefone     !== undefined) data.telefone     = telefone?.trim() || null
    if (whatsapp     !== undefined) data.whatsapp     = whatsapp?.trim() || null
    if (principal    !== undefined) data.principal    = !!principal

    const atualizado = await prisma.socio.update({ where: { id }, data })

    // Reindexar empresa no RAG — passa clienteId para isolar por escopo cliente
    const empresa = await prisma.empresa.findUnique({
      where:   { id: socio.empresaId },
      include: { socios: true, clientes: { select: { id: true }, take: 1 } },
    })
    if (empresa) {
      indexarAsync('empresa', {
        id:           empresa.id,
        clienteId:    empresa.clientes[0]?.id ?? null,
        cnpj:         empresa.cnpj,
        razaoSocial:  empresa.razaoSocial,
        nomeFantasia: empresa.nomeFantasia,
        regime:       empresa.regime,
        socios:       empresa.socios,
      })
    }

    return NextResponse.json(atualizado)
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm-socios', operation: 'update' }, extra: { socioId: id } })
    return NextResponse.json({ error: 'Erro ao atualizar sócio' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const socio = await prisma.socio.findUnique({
      where:  { id },
      select: { id: true, empresaId: true, portalAccess: true },
    })
    if (!socio) return NextResponse.json({ error: 'Sócio não encontrado' }, { status: 404 })

    // Invalida tokens de portal antes de deletar
    if (socio.portalAccess) {
      await prisma.portalToken.deleteMany({ where: { socioId: id } })
    }

    await prisma.socio.delete({ where: { id } })

    // Reindexar empresa no RAG — passa clienteId para isolar por escopo cliente
    const empresa = await prisma.empresa.findUnique({
      where:   { id: socio.empresaId },
      include: { socios: true, clientes: { select: { id: true }, take: 1 } },
    })
    if (empresa) {
      indexarAsync('empresa', {
        id:           empresa.id,
        clienteId:    empresa.clientes[0]?.id ?? null,
        cnpj:         empresa.cnpj,
        razaoSocial:  empresa.razaoSocial,
        nomeFantasia: empresa.nomeFantasia,
        regime:       empresa.regime,
        socios:       empresa.socios,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm-socios', operation: 'delete' }, extra: { socioId: id } })
    return NextResponse.json({ error: 'Erro ao remover sócio' }, { status: 500 })
  }
}
