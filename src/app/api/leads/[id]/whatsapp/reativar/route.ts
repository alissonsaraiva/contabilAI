import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

function buildRemoteJid(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

function extrairTelefone(lead: { contatoEntrada: string; dadosJson: unknown }): string | null {
  const dados = lead.dadosJson as Record<string, string> | null
  const candidatos = [
    dados?.['WhatsApp'],
    dados?.['Telefone'],
    dados?.['Celular'],
    /^\+?[\d\s()\-]{8,}$/.test(lead.contatoEntrada) ? lead.contatoEntrada : null,
  ]
  return candidatos.find(v => v && v.replace(/\D/g, '').length >= 8) ?? null
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { contatoEntrada: true, dadosJson: true },
  })
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = extrairTelefone(lead)
  if (!phone) return NextResponse.json({ error: 'Lead sem número' }, { status: 400 })

  const remoteJid = buildRemoteJid(phone)

  // Reativa apenas a conversa mais recente (por remoteJid OU leadId)
  const conversa = await prisma.conversaIA.findFirst({
    where: {
      canal: 'whatsapp',
      OR: [{ remoteJid }, { leadId: id }],
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
