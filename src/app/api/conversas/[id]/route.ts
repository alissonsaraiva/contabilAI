import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { sendText, sendMedia, type EvolutionConfig } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { resolveMediaUrl } from '@/lib/whatsapp-utils'

type Params = { params: Promise<{ id: string }> }

// ─── GET — retorna conversa + mensagens ───────────────────────────────────────
// Formato compatível com WhatsAppChatPanel (para conversas sem entidade vinculada)
// e com PortalConversaPanel (portal do cliente)

export async function GET(
  _req: Request,
  { params }: Params,
) {
  const session = await auth()
  const user = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const conversa = await prisma.conversaIA.findUnique({
    where: { id },
    include: {
      mensagens: { orderBy: { criadaEm: 'asc' } },
      cliente:   { select: { id: true, nome: true } },
      lead:      { select: { id: true, contatoEntrada: true, dadosJson: true } },
    },
  })

  if (!conversa) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const telefone = conversa.remoteJid?.replace('@s.whatsapp.net', '') ?? null

  const mensagens = conversa.mensagens.map(({ whatsappMsgData, ...m }) => ({
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
    conversa:  { id: conversa.id, canal: conversa.canal, pausadaEm: conversa.pausadaEm },
    mensagens,
    pausada:   !!conversa.pausadaEm,
    telefone,
    cliente:   conversa.cliente,
    lead:      conversa.lead,
  })
}

// ─── POST — envia mensagem para conversa WhatsApp sem entidade vinculada ──────
// Para conversas com entidade, usar /api/clientes/[id]/whatsapp etc.
// Formato: { conteudo, pausarIA?, mediaUrl?, mediaType?, mediaFileName?, mediaMimeType? }

export async function POST(
  req: Request,
  { params }: Params,
) {
  const session = await auth()
  const user = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as {
    conteudo?: string
    pausarIA?: boolean
    mediaUrl?: string
    mediaType?: string
    mediaFileName?: string
    mediaMimeType?: string
  }

  const conteudo      = (body.conteudo ?? '').trim()
  const mediaUrl      = body.mediaUrl      ?? null
  const mediaType     = body.mediaType     ?? null
  const mediaFileName = body.mediaFileName ?? null
  const mediaMimeType = body.mediaMimeType ?? null
  const pausarIA      = body.pausarIA !== false

  if (!conteudo && !mediaUrl) {
    return NextResponse.json({ error: 'Conteúdo ou arquivo obrigatório' }, { status: 400 })
  }

  const conversa = await prisma.conversaIA.findUnique({
    where: { id },
    select: { id: true, canal: true, remoteJid: true, pausadaEm: true },
  })
  if (!conversa) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (conversa.canal !== 'whatsapp' || !conversa.remoteJid) {
    return NextResponse.json({ error: 'Endpoint só suporta conversas WhatsApp' }, { status: 400 })
  }

  const row = await prisma.escritorio.findFirst({
    select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
  })
  if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) {
    return NextResponse.json({ error: 'WhatsApp não configurado no escritório' }, { status: 400 })
  }

  const cfg: EvolutionConfig = {
    baseUrl:  row.evolutionApiUrl,
    apiKey:   isEncrypted(row.evolutionApiKey) ? decrypt(row.evolutionApiKey) : row.evolutionApiKey,
    instance: row.evolutionInstance,
  }

  if (pausarIA && !conversa.pausadaEm) {
    await prisma.conversaIA.update({
      where: { id },
      data:  { pausadaEm: new Date(), pausadoPorId: user.id ?? null },
    })
  }

  // URLs R2 diretas retornam 403 — gera URL assinada (5 min) antes de passar à Evolution
  const mediaUrlParaEnvio = mediaUrl ? await resolveMediaUrl(mediaUrl, `conversaId:${id}`) : null
  const sendResult = mediaUrlParaEnvio
    ? await sendMedia(cfg, conversa.remoteJid, {
        mediatype: (mediaType === 'image' ? 'image' : 'document') as 'image' | 'document',
        mimetype:  mediaMimeType ?? 'application/octet-stream',
        fileName:  mediaFileName ?? 'arquivo',
        caption:   conteudo || undefined,
        mediaUrl:  mediaUrlParaEnvio,
      })
    : await sendText(cfg, conversa.remoteJid, conteudo)

  await prisma.mensagemIA.create({
    data: {
      conversaId: id,
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

  await prisma.conversaIA.update({
    where: { id },
    data:  { atualizadaEm: new Date() },
  })

  if (!sendResult.ok) {
    return NextResponse.json(
      { error: 'Mensagem salva, mas falha ao entregar via WhatsApp', detail: sendResult.error },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, conversaId: id })
}
