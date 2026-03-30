import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { getOrCreateConversaSession, getHistorico } from '@/lib/ai/conversa'
import { notificarEscalacaoPortal } from '@/lib/notificacoes'
import { indexarAsync } from '@/lib/rag/indexar-async'

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any

  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let clienteId: string
  if (user.tipo === 'socio') {
    const titular = await prisma.cliente.findUnique({
      where: { empresaId: user.empresaId },
      select: { id: true },
    })
    if (!titular) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 })
    clienteId = titular.id
  } else {
    clienteId = user.id
  }
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

  // Indexa no RAG
  indexarAsync('escalacao', {
    id:        escalacao.id,
    clienteId,
    canal:     'portal',
    motivoIA:  escalacao.motivoIA,
    criadoEm:  escalacao.criadoEm,
  })

  // Notifica equipe CRM
  notificarEscalacaoPortal(clienteId, escalacao.id).catch(() => {})

  return NextResponse.json({ ok: true, escalacaoId: escalacao.id })
}
