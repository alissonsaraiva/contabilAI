import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('token')
  if (!raw) {
    return NextResponse.json({ error: 'token_invalido' }, { status: 400 })
  }

  const hash = crypto.createHash('sha256').update(raw).digest('hex')

  const record = await prisma.portalToken.findUnique({
    where:   { token: hash },
    include: {
      cliente: { select: { id: true, nome: true, email: true, status: true } },
      socio:   { select: { id: true, nome: true, email: true, portalAccess: true } },
    },
  })

  if (!record) {
    return NextResponse.json({ error: 'token_invalido' }, { status: 400 })
  }
  if (record.usedAt) {
    return NextResponse.json({ error: 'token_invalido' }, { status: 400 })
  }
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: 'token_expirado' }, { status: 400 })
  }

  // Determina quem é o portador do token
  if (record.cliente) {
    const { status } = record.cliente
    if (status !== 'ativo' && status !== 'inadimplente') {
      return NextResponse.json({ error: 'conta_inativa' }, { status: 403 })
    }

    await prisma.portalToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })

    return NextResponse.json({
      id:        record.cliente.id,
      nome:      record.cliente.nome,
      email:     record.cliente.email,
      tipo:      'cliente',
      empresaId: record.empresaId,
    })
  }

  if (record.socio) {
    if (!record.socio.portalAccess) {
      return NextResponse.json({ error: 'acesso_negado' }, { status: 403 })
    }
    if (!record.socio.email) {
      return NextResponse.json({ error: 'token_invalido' }, { status: 400 })
    }

    await prisma.portalToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })

    return NextResponse.json({
      id:        record.socio.id,
      nome:      record.socio.nome,
      email:     record.socio.email,
      tipo:      'socio',
      empresaId: record.empresaId,
    })
  }

  return NextResponse.json({ error: 'token_invalido' }, { status: 400 })
}
