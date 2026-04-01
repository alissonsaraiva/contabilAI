import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { downloadMedia } from '@/lib/whatsapp/media'
import { decrypt, isEncrypted } from '@/lib/crypto'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mensagemId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { mensagemId } = await params

  const mensagem = await prisma.mensagemIA.findUnique({
    where: { id: mensagemId },
    select: { whatsappMsgData: true, mediaBuffer: true, mediaMimeType: true, mediaFileName: true },
  })

  if (!mensagem) {
    return NextResponse.json({ error: 'Mídia não disponível' }, { status: 404 })
  }

  // Serve do buffer persistido no banco (caminho principal — sem dependência da Evolution)
  if (mensagem.mediaBuffer) {
    const contentType = mensagem.mediaMimeType || 'application/octet-stream'
    const isInline = contentType.startsWith('audio/') || contentType.startsWith('image/')
    return new Response(new Uint8Array(mensagem.mediaBuffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': isInline
          ? 'inline'
          : `attachment; filename="${mensagem.mediaFileName ?? 'arquivo'}"`,
        'Cache-Control': 'private, max-age=86400',
      },
    })
  }

  // Fallback: tenta re-fetch na Evolution (funciona apenas nos primeiros minutos após recebimento)
  if (!mensagem.whatsappMsgData) {
    return NextResponse.json({ error: 'Mídia não disponível' }, { status: 404 })
  }

  const row = await prisma.escritorio.findFirst({
    select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
  })

  if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) {
    return NextResponse.json({ error: 'Evolution não configurada' }, { status: 503 })
  }

  const rawKey = row.evolutionApiKey as string
  const apiKey = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey

  const cfg = {
    baseUrl:  row.evolutionApiUrl,
    apiKey,
    instance: row.evolutionInstance,
  }

  // Extrai apenas { key, message } — campos extras como remoteJid/clienteId quebram o getBase64FromMediaMessage da Evolution API
  const raw = mensagem.whatsappMsgData as Record<string, unknown>
  const msgForDownload = { key: raw.key, message: raw.message }
  const media = await downloadMedia(cfg, msgForDownload)
  if (!media) {
    return NextResponse.json({ error: 'Mídia não encontrada na Evolution' }, { status: 404 })
  }

  // Persiste buffer para futuras requisições (backfill de mensagens antigas)
  prisma.mensagemIA.update({
    where: { id: mensagemId },
    data: {
      mediaBuffer:   media.buffer as unknown as Uint8Array<ArrayBuffer>,
      mediaMimeType: media.mimeType,
      mediaFileName: media.fileName ?? null,
    },
  }).catch(() => null)

  const contentType = media.mimeType || 'application/octet-stream'
  const isInline = contentType.startsWith('audio/') || contentType.startsWith('image/')
  return new Response(new Uint8Array(media.buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': isInline
        ? 'inline'
        : `attachment; filename="${media.fileName ?? 'arquivo'}"`,
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
