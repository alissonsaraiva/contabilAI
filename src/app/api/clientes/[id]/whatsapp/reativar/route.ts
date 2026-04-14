import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

function buildRemoteJid(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const cliente = await prisma.cliente.findUnique({
    where: { id },
    select: { whatsapp: true, telefone: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = cliente.whatsapp
  if (!phone) return NextResponse.json({ error: 'Cliente sem WhatsApp cadastrado' }, { status: 400 })

  const remoteJid = buildRemoteJid(phone)

  // Reativa apenas a conversa mais recente (por remoteJid OU clienteId)
  // — updateMany poderia ativar conversas antigas ou de números que mudaram de dono
  const conversa = await prisma.conversaIA.findFirst({
    where: {
      canal: 'whatsapp',
      OR: [{ remoteJid }, { clienteId: id }],
      NOT: { pausadaEm: null },
    },
    orderBy: { atualizadaEm: 'desc' },
    select: { id: true },
  })

  if (conversa) {
    await prisma.conversaIA.update({
      where: { id: conversa.id },
      data: { pausadaEm: null, pausadoPorId: null },
    })
  }

  return NextResponse.json({ ok: true })
}
