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
  const {
    conversaId,
    mensagem,
    mediaUrl,
    mediaType,
    mediaFileName,
    mediaMimeType,
  } = await req.json() as {
    conversaId: string
    mensagem?: string
    mediaUrl?: string
    mediaType?: string
    mediaFileName?: string
    mediaMimeType?: string
  }

  if (!conversaId?.trim() || (!mensagem?.trim() && !mediaUrl?.trim())) {
    return NextResponse.json({ error: 'conversaId e mensagem ou arquivo são obrigatórios' }, { status: 400 })
  }

  // Valida que a conversa pertence ao cliente e é canal portal
  const conversa = await prisma.conversaIA.findFirst({
    where: { id: conversaId, clienteId, canal: 'portal' },
    select: { id: true },
  })
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  const conteudo = mensagem?.trim() || ''

  // Salva mensagem como assistant e despausa a conversa (permite IA retomar)
  const [novaMensagem] = await Promise.all([
    prisma.mensagemIA.create({
      data: {
        conversaId,
        role:          'assistant',
        conteudo,
        status:        'sent',
        tentativas:    1,
        ...(mediaUrl && {
          mediaUrl,
          mediaType:     mediaType ?? 'document',
          mediaFileName: mediaFileName ?? 'arquivo',
          mediaMimeType: mediaMimeType ?? 'application/octet-stream',
        }),
      },
    }),
    prisma.conversaIA.update({
      where: { id: conversaId },
      data:  { pausadaEm: null, pausadoPorId: null, atualizadaEm: new Date() },
    }),
  ])

  // Resolve escalação pendente deste chat (se houver)
  prisma.escalacao.updateMany({
    where: { conversaIAId: conversaId, canal: 'portal', status: 'pendente' },
    data:  { status: 'resolvida', respostaEnviada: conteudo || mediaFileName || 'arquivo', operadorId: user.id },
  }).catch((err: unknown) =>
    console.error('[crm/portal-chat] erro ao resolver escalação pendente:', { conversaId, err }),
  )

  // Notifica o portal do cliente via SSE
  emitConversaMensagem(conversaId, {
    id:            novaMensagem.id,
    role:          'assistant',
    conteudo,
    mediaUrl:      mediaUrl ?? null,
    mediaType:     mediaType ?? null,
    mediaFileName: mediaFileName ?? null,
  })

  // Push para o cliente
  const pushBody = conteudo || (mediaFileName ? `Arquivo: ${mediaFileName}` : 'Arquivo enviado')
  sendPushToCliente(clienteId, {
    title: 'Nova mensagem da equipe',
    body:  pushBody.slice(0, 100),
    url:   '/portal/suporte',
  }).catch((err: unknown) =>
    console.error('[crm/portal-chat] erro ao enviar push mensagem manual:', { clienteId, err }),
  )

  return NextResponse.json({ ok: true, mensagem: novaMensagem })
}
