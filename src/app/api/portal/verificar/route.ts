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
    include: { cliente: { select: { id: true, nome: true, email: true, status: true } } },
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
  if (record.cliente.status !== 'ativo' && record.cliente.status !== 'inadimplente') {
    return NextResponse.json({ error: 'conta_inativa' }, { status: 403 })
  }

  // Marca como usado
  await prisma.portalToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })

  return NextResponse.json({
    clienteId: record.cliente.id,
    nome:      record.cliente.nome,
    email:     record.cliente.email,
  })
}
