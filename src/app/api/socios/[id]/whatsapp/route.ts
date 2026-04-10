/**
 * GET  /api/socios/[id]/whatsapp — histórico de conversa WhatsApp com o sócio
 * POST /api/socios/[id]/whatsapp — envia mensagem ou mídia para o sócio via WhatsApp
 *
 * Conversa armazenada em ConversaIA com socioId + clienteId do titular da empresa,
 * garantindo rastreabilidade no histórico do cliente.
 */
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

  const { id: socioId } = await params

  const socio = await prisma.socio.findUnique({
    where:  { id: socioId },
    select: { whatsapp: true, telefone: true, nome: true },
  })
  if (!socio) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const phone = socio.whatsapp || socio.telefone
  if (!phone) return NextResponse.json({ conversa: null, mensagens: [], pausada: false })

  const remoteJid = buildRemoteJid(phone)
  if (!remoteJid) return NextResponse.json({ conversa: null, mensagens: [], pausada: false })

  // Busca todas as conversas WhatsApp do sócio (por número atual OU por socioId)
  const conversas = await prisma.conversaIA.findMany({
    where: {
      canal: 'whatsapp',
      OR: [{ remoteJid }, { socioId }],
    },
    orderBy: { criadaEm: 'asc' },
    include: { mensagens: { orderBy: { criadaEm: 'asc' } } },
  })

  const conversaAtual = conversas.at(-1) ?? null
  const mensagens = conversas.flatMap(c => c.mensagens).map(({ whatsappMsgData, ...m }) => ({
    ...m,
    // Mensagem excluída: apaga conteúdo e mídia — front renderiza placeholder
    conteudo:      m.excluido ? null : m.conteudo,
    mediaUrl:      m.excluido ? null : m.mediaUrl,
    mediaType:     m.excluido ? null : m.mediaType,
    mediaFileName: m.excluido ? null : m.mediaFileName,
    hasWhatsappMedia: !m.excluido && !m.mediaUrl && (
      m.mediaType === 'document' ||
      (!!whatsappMsgData && m.conteudo.startsWith('[') && m.conteudo.endsWith(']'))
    ),
  }))

  return NextResponse.json({
    conversa:  conversaAtual ? { id: conversaAtual.id, pausadaEm: conversaAtual.pausadaEm } : null,
    mensagens,
    pausada:   !!conversaAtual?.pausadaEm,
    remoteJid,
    telefone:  phone,
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

  const { id: socioId } = await params
  const body = await req.json()
  const conteudo      = (body?.conteudo      as string | undefined)?.trim() ?? ''
  const mediaUrl      = (body?.mediaUrl      as string | undefined) ?? null
  const mediaType     = (body?.mediaType     as string | undefined) ?? null
  const mediaFileName = (body?.mediaFileName as string | undefined) ?? null
  const mediaMimeType = (body?.mediaMimeType as string | undefined) ?? null
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
    // Busca sócio + empresa + titular para vincular o histórico
    const socio = await prisma.socio.findUnique({
      where:   { id: socioId },
      select: {
        whatsapp: true, telefone: true, nome: true,
        empresa: { select: { clientes: { select: { id: true }, take: 1 } } },
      },
    })
    if (!socio) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const phone = socio.whatsapp || socio.telefone
    if (!phone) return NextResponse.json({ error: 'Sócio sem número de telefone/WhatsApp cadastrado' }, { status: 400 })

    const remoteJid = buildRemoteJid(phone)
    if (!remoteJid) return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 })

    const cfg = await getEvolutionConfig()
    if (!cfg) return NextResponse.json({ error: 'WhatsApp não configurado no escritório' }, { status: 400 })

    const clienteId = socio.empresa.clientes[0]?.id  // titular da empresa

    // Busca conversa existente pelo remoteJid ou cria com socioId
    let conversa = await prisma.conversaIA.findFirst({
      where:   { canal: 'whatsapp', remoteJid },
      orderBy: { atualizadaEm: 'desc' },
      select:  { id: true },
    })

    if (!conversa) {
      conversa = await prisma.conversaIA.create({
        data:   { canal: 'whatsapp', remoteJid, socioId, clienteId },
        select: { id: true },
      })
    }

    // Registra interação e pausa IA se necessário
    await prisma.conversaIA.update({
      where: { id: conversa.id },
      data: pausarIA
        ? { pausadaEm: new Date(), pausadoPorId: session.user.id, atualizadaEm: new Date() }
        : { atualizadaEm: new Date() },
    })
    if (clienteId) {
      await prisma.interacao.create({
        data: {
          clienteId,
          usuarioId: session.user.id,
          tipo:     'whatsapp_enviado',
          titulo:   `WhatsApp enviado para sócio ${socio.nome}`,
          conteudo: conteudo || (mediaFileName ? `[Arquivo: ${mediaFileName}]` : '[Mídia enviada]'),
        },
      })
    }

    // Envia via Evolution
    const sendResult = mediaUrl
      ? await sendMedia(cfg, remoteJid, {
          mediatype: (mediaType === 'image' ? 'image' : 'document') as 'image' | 'document',
          mimetype:  mediaMimeType ?? 'application/octet-stream',
          fileName:  mediaFileName ?? 'arquivo',
          caption:   conteudo || undefined,
          mediaUrl,
        })
      : await sendText(cfg, remoteJid, conteudo)

    // Persiste mensagem
    await prisma.mensagemIA.create({
      data: {
        conversaId:  conversa.id,
        role:        'assistant',
        conteudo,
        status:      sendResult.ok ? 'sent' : 'failed',
        tentativas:  sendResult.ok ? 1 : ('attempts' in sendResult ? sendResult.attempts : 1),
        erroEnvio:   sendResult.ok ? null : sendResult.error,
        mediaUrl,
        mediaType,
        mediaFileName,
        mediaMimeType,
      },
    })

    // RAG — indexa no escopo do cliente titular (fire-and-forget — erros tratados em indexarAsync)
    if (clienteId) {
      indexarAsync('interacao', {
        id:        conversa.id,
        clienteId,
        tipo:      'whatsapp_enviado',
        titulo:    `WhatsApp enviado para sócio ${socio.nome}`,
        conteudo,
        criadoEm:  new Date(),
      })
    }

    if (!sendResult.ok) {
      return NextResponse.json(
        { error: 'Mensagem salva, mas falha ao entregar via WhatsApp', detail: sendResult.error },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true, conversaId: conversa.id })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'whatsapp-api', operation: 'post-socio' },
      extra: { socioId },
    })
    return NextResponse.json({ error: 'Erro interno ao enviar mensagem' }, { status: 500 })
  }
}
