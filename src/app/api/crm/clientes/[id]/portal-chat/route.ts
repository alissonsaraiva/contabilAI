import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { emitConversaMensagem } from '@/lib/event-bus'
import { sendPushToCliente } from '@/lib/push'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const conversas = await prisma.conversaIA.findMany({
    where: { clienteId: id, canal: 'portal' },
    orderBy: { atualizadaEm: 'desc' },
    take: 20,
    select: {
      id:           true,
      criadaEm:     true,
      atualizadaEm: true,
      pausadaEm:    true,
      mensagens: {
        orderBy: { criadaEm: 'asc' },
        select: { id: true, role: true, conteudo: true, criadaEm: true },
      },
    },
  })

  return NextResponse.json({ conversas })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user    = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id: clienteId } = await params
  const { conversaId, mensagem } = await req.json() as { conversaId: string; mensagem: string }

  if (!conversaId?.trim() || !mensagem?.trim()) {
    return NextResponse.json({ error: 'conversaId e mensagem são obrigatórios' }, { status: 400 })
  }

  // Valida que a conversa pertence ao cliente e é canal portal
  const conversa = await prisma.conversaIA.findFirst({
    where: { id: conversaId, clienteId, canal: 'portal' },
    select: { id: true },
  })
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  // Salva mensagem como assistant e despausa a conversa (permite IA retomar)
  const [novaMensagem] = await Promise.all([
    prisma.mensagemIA.create({
      data: {
        conversaId,
        role:      'assistant',
        conteudo:  mensagem.trim(),
        status:    'sent',
        tentativas: 1,
      },
    }),
    prisma.conversaIA.update({
      where: { id: conversaId },
      data:  { pausadaEm: null, pausadoPorId: null, atualizadaEm: new Date() },
    }),
  ])

  // Resolve escalação pendente deste chat (se houver)
  prisma.escalacao.updateMany({
    where:  { conversaIAId: conversaId, canal: 'portal', status: 'pendente' },
    data:   { status: 'resolvida', respostaEnviada: mensagem.trim(), operadorId: user.id },
  }).catch((err: unknown) =>
    console.error('[crm/portal-chat] erro ao resolver escalação pendente:', { conversaId, err }),
  )

  // Notifica o portal do cliente via SSE
  emitConversaMensagem(conversaId, { role: 'assistant', conteudo: mensagem.trim() })

  // Push para o cliente
  sendPushToCliente(clienteId, {
    title: 'Nova mensagem da equipe',
    body:  mensagem.trim().slice(0, 100),
    url:   '/portal/suporte',
  }).catch((err: unknown) =>
    console.error('[crm/portal-chat] erro ao enviar push mensagem manual:', { clienteId, err }),
  )

  return NextResponse.json({ ok: true, mensagem: novaMensagem })
}
