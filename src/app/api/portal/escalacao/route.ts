import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { getOrCreateConversaSession, getHistorico } from '@/lib/ai/conversa'
import { notificarEscalacaoPortal } from '@/lib/notificacoes'

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any

  if (!user || user.tipo !== 'cliente') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const clienteId: string = user.id
  const { sessionId, motivo } = await req.json() as { sessionId: string; motivo?: string }

  if (!sessionId?.trim()) {
    return NextResponse.json({ error: 'sessionId obrigatório' }, { status: 400 })
  }

  // Verifica se já existe escalação pendente para este cliente
  const existente = await prisma.escalacao.findFirst({
    where: { clienteId, status: 'pendente', canal: 'portal' },
  })
  if (existente) {
    return NextResponse.json({ ok: true, escalacaoId: existente.id, jaExistia: true })
  }

  const conversaId = await getOrCreateConversaSession(sessionId, 'portal', { clienteId })
  const historico  = await getHistorico(conversaId)

  const ultimaMsg = Array.isArray(historico)
    ? [...historico].reverse().find((m: any) => m.role === 'user')?.content ?? ''
    : ''

  const escalacao = await prisma.escalacao.create({
    data: {
      canal:          'portal',
      status:         'pendente',
      clienteId,
      conversaIAId:   conversaId,
      historico:      historico as object[],
      ultimaMensagem: ultimaMsg as string,
      motivoIA:       motivo ?? 'Cliente solicitou atendimento humano pelo portal.',
    },
  })

  // Notifica equipe CRM
  notificarEscalacaoPortal(clienteId, escalacao.id).catch(() => {})

  return NextResponse.json({ ok: true, escalacaoId: escalacao.id })
}
