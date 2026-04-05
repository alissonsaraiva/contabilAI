import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { sendText, sendMedia } from '@/lib/evolution'
import { indexarAsync } from '@/lib/rag/indexar-async'
import * as Sentry from '@sentry/nextjs'
import {
  buildRemoteJid,
  getEvolutionConfig,
  isMediaUrlTrusted,
  checkRateLimit,
  WHATSAPP_ALLOWED_MIME,
} from '@/lib/whatsapp-utils'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    select: { whatsapp: true, telefone: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = cliente.whatsapp || cliente.telefone
  if (!phone) return NextResponse.json({ conversa: null, mensagens: [], pausada: false })

  const remoteJid = buildRemoteJid(phone)
  if (!remoteJid) return NextResponse.json({ conversa: null, mensagens: [], pausada: false })

  // Busca todas as conversas WhatsApp do cliente (por número atual OU por clienteId)
  // — cobre casos em que o número mudou e há histórico em conversas com remoteJid anterior
  const conversas = await prisma.conversaIA.findMany({
    where: {
      canal: 'whatsapp',
      OR: [{ remoteJid }, { clienteId: id }],
    },
    orderBy: { criadaEm: 'asc' },
    include: { mensagens: { orderBy: { criadaEm: 'asc' } } },
  })

  // Conversa mais recente determina o estado de pausa
  const conversaAtual = conversas.at(-1) ?? null

  // Consolida todas as mensagens em ordem cronológica
  // hasWhatsappMedia: mensagem tem mídia no proxy (whatsappMsgData) mas não em mediaUrl direto
  const mensagens = conversas.flatMap(c => c.mensagens).map(({ whatsappMsgData, ...m }) => ({
    ...m,
    // Mensagem excluída: apaga conteúdo e mídia — front renderiza placeholder
    conteudo:      m.excluido ? null : m.conteudo,
    mediaUrl:      m.excluido ? null : m.mediaUrl,
    mediaType:     m.excluido ? null : m.mediaType,
    mediaFileName: m.excluido ? null : m.mediaFileName,
    // Detecta mídia no proxy por mediaType (cobre PDFs antigos com texto no conteudo)
    // ou pela combinação clássica whatsappMsgData + label exato
    hasWhatsappMedia: !m.excluido && !m.mediaUrl && (
      m.mediaType === 'document' ||
      (!!whatsappMsgData && m.conteudo.startsWith('[') && m.conteudo.endsWith(']'))
    ),
  }))

  return NextResponse.json({
    conversa: conversaAtual ? { id: conversaAtual.id, pausadaEm: conversaAtual.pausadaEm } : null,
    mensagens,
    pausada: !!conversaAtual?.pausadaEm,
    remoteJid,
    telefone: phone,
  })
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Bug #15: rate limiting por userId
  const rateCheck = checkRateLimit(session.user.id)
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: 'Muitas mensagens. Aguarde antes de enviar novamente.' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } },
    )
  }

  const { id } = await params
  const body = await req.json()
  const conteudo      = (body?.conteudo as string | undefined)?.trim() ?? ''
  const mediaUrl      = (body?.mediaUrl      as string | undefined) ?? null
  const mediaType     = (body?.mediaType     as string | undefined) ?? null
  const mediaFileName = (body?.mediaFileName as string | undefined) ?? null
  const mediaMimeType = (body?.mediaMimeType as string | undefined) ?? null
  // pausarIA=false → envia como comunicado sem assumir controle (IA continua ativa)
  const pausarIA = body?.pausarIA !== false
  if (!conteudo && !mediaUrl) return NextResponse.json({ error: 'Conteúdo ou arquivo obrigatório' }, { status: 400 })

  // Bug #8: valida domínio da mídia e MIME type
  if (mediaUrl) {
    if (!isMediaUrlTrusted(mediaUrl)) {
      return NextResponse.json({ error: 'URL de mídia não permitida' }, { status: 400 })
    }
    // mediaMimeType é obrigatório quando há arquivo — rejeita null para prevenir bypass
    if (!mediaMimeType || !WHATSAPP_ALLOWED_MIME.has(mediaMimeType)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 })
    }
  }

  // Bug #11: try/catch com Sentry cobrindo todo o fluxo de envio
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      select: { whatsapp: true, telefone: true },
    })
    if (!cliente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const phone = cliente.whatsapp || cliente.telefone
    if (!phone) return NextResponse.json({ error: 'Cliente sem número de telefone/WhatsApp' }, { status: 400 })

    const remoteJid = buildRemoteJid(phone)
    if (!remoteJid) return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 })

    const cfg = await getEvolutionConfig()
    if (!cfg) return NextResponse.json({ error: 'WhatsApp não configurado no escritório' }, { status: 400 })

    // Busca conversa existente (qualquer idade) ou cria nova
    let conversa = await prisma.conversaIA.findFirst({
      where: { canal: 'whatsapp', remoteJid },
      orderBy: { atualizadaEm: 'desc' },
      select: { id: true },
    })

    if (!conversa) {
      conversa = await prisma.conversaIA.create({
        data: { canal: 'whatsapp', remoteJid, clienteId: id },
        select: { id: true },
      })
    }

    // Fase 1: registra interação e pausa a IA se necessário
    await prisma.$transaction([
      prisma.conversaIA.update({
        where: { id: conversa.id },
        data: pausarIA
          ? { pausadaEm: new Date(), pausadoPorId: session.user.id, atualizadaEm: new Date() }
          : { atualizadaEm: new Date() },
      }),
      prisma.interacao.create({
        data: {
          clienteId: id,
          usuarioId: session.user.id,
          tipo: 'whatsapp_enviado',
          titulo: 'WhatsApp enviado',
          conteudo: conteudo || (mediaFileName ? `[Arquivo: ${mediaFileName}]` : '[Mídia enviada]'),
        },
      }),
    ])

    // Fase 2: tenta enviar via Evolution API (com retry automático)
    const sendResult = mediaUrl
      ? await sendMedia(cfg, remoteJid, {
          mediatype: (mediaType === 'image' ? 'image' : 'document') as 'image' | 'document',
          mimetype:  mediaMimeType ?? 'application/octet-stream',
          fileName:  mediaFileName ?? 'arquivo',
          caption:   conteudo || undefined,
          mediaUrl,
        })
      : await sendText(cfg, remoteJid, conteudo)

    // Fase 3: persiste a mensagem com o status correto
    await prisma.mensagemIA.create({
      data: {
        conversaId: conversa.id,
        role: 'assistant',
        conteudo,
        status: sendResult.ok ? 'sent' : 'failed',
        tentativas: sendResult.ok ? 1 : ('attempts' in sendResult ? sendResult.attempts : 1),
        erroEnvio: sendResult.ok ? null : sendResult.error,
        mediaUrl,
        mediaType,
        mediaFileName,
        mediaMimeType,
      },
    })

    // Indexa no RAG (fire-and-forget — erros já tratados internamente em indexarAsync)
    indexarAsync('interacao', {
      id:        conversa!.id,
      clienteId: id,
      tipo:      'whatsapp_enviado',
      titulo:    'WhatsApp enviado pelo escritório',
      conteudo,
      criadoEm:  new Date(),
    })

    if (!sendResult.ok) {
      return NextResponse.json(
        { error: 'Mensagem salva, mas falha ao entregar via WhatsApp', detail: sendResult.error },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true, conversaId: conversa.id })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'whatsapp-api', operation: 'post-cliente' },
      extra: { clienteId: id },
    })
    return NextResponse.json({ error: 'Erro interno ao enviar mensagem' }, { status: 500 })
  }
}
