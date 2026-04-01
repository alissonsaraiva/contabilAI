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
    select: { whatsappMsgData: true },
  })

  if (!mensagem?.whatsappMsgData) {
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

  const media = await downloadMedia(cfg, mensagem.whatsappMsgData as Record<string, unknown>)
  if (!media) {
    return NextResponse.json({ error: 'Mídia não encontrada na Evolution' }, { status: 404 })
  }

  const contentType = media.mimeType || 'application/octet-stream'
  const isInline = contentType.startsWith('audio/') || contentType.startsWith('image/')
  return new Response(new Uint8Array(media.buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': isInline
        ? 'inline'
        : `attachment; filename="${media.fileName ?? 'arquivo'}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
