import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { isEncrypted, decrypt } from '@/lib/crypto'
import { sendHumanLike, } from '@/lib/whatsapp/human-like'
import { sendMedia, type EvolutionConfig } from '@/lib/evolution'
import { emitConversaMensagem } from '@/lib/event-bus'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  const user = session?.user as any
  if (!session || (user?.tipo !== 'admin' && user?.tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const body        = await req.json() as { texto?: string; mediaUrl?: string; mediaType?: string; mediaFileName?: string; mediaMimeType?: string }
  const texto       = body.texto?.trim() ?? ''
  const mediaUrl      = body.mediaUrl      ?? null
  const mediaType     = body.mediaType     ?? null
  const mediaFileName = body.mediaFileName ?? null
  const mediaMimeType = body.mediaMimeType ?? null
  if (!texto && !mediaUrl) return NextResponse.json({ error: 'texto ou arquivo obrigatório' }, { status: 400 })

  const conversa = await prisma.conversaIA.findUnique({
    where: { id },
    select: { id: true, canal: true, remoteJid: true, pausadaEm: true },
  })
  if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })

  // Persiste a mensagem do humano como role 'assistant' (é uma resposta ao cliente)
  await prisma.mensagemIA.create({
    data: {
      conversaId: id,
      role: 'assistant',
      conteudo: texto,
      status: 'pending',
      mediaUrl,
      mediaType,
      mediaFileName,
      mediaMimeType,
    },
  })

  // Entrega via Escalacao para onboarding (widget faz poll)
  if (conversa.canal === 'onboarding') {
    try {
      const convRow = await prisma.conversaIA.findUnique({
        where: { id },
        select: { leadId: true, sessionId: true },
      })
      const escalacao = await prisma.escalacao.findFirst({
        where: {
          canal: 'onboarding',
          status: { in: ['pendente', 'em_atendimento'] },
          ...(convRow?.leadId
            ? { leadId: convRow.leadId }
            : { sessionId: convRow?.sessionId ?? undefined }),
        },
        orderBy: { criadoEm: 'desc' },
      })
      if (escalacao) {
        const respostaTexto = mediaUrl
          ? [texto, `[Arquivo: ${mediaFileName ?? 'arquivo'}]\n${mediaUrl}`].filter(Boolean).join('\n')
          : texto
        await prisma.escalacao.update({
          where: { id: escalacao.id },
          data: { respostaEnviada: respostaTexto, status: 'resolvida' },
        })
        await prisma.mensagemIA.updateMany({
          where: { conversaId: id, role: 'assistant', status: 'pending' },
          data: { status: 'sent' },
        })
      }
    } catch (err) {
      console.error('[conversas/mensagem] erro ao entregar via escalação:', err)
      Sentry.captureException(err, { tags: { module: 'conversas-mensagem', operation: 'escalacao-onboarding' }, extra: { conversaId: id } })
    }
    return NextResponse.json({ ok: true })
  }

  // Envia via WhatsApp se aplicável
  if (conversa.canal === 'whatsapp' && conversa.remoteJid) {
    const row = await prisma.escritorio.findFirst({
      select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
    })

    if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
      const cfg: EvolutionConfig = {
        baseUrl: row.evolutionApiUrl,
        apiKey: isEncrypted(row.evolutionApiKey) ? decrypt(row.evolutionApiKey) : row.evolutionApiKey,
        instance: row.evolutionInstance,
      }
      const result = mediaUrl
        ? await sendMedia(cfg, conversa.remoteJid, {
            mediatype: (mediaType === 'image' ? 'image' : 'document') as 'image' | 'document',
            mimetype:  mediaMimeType ?? 'application/octet-stream',
            fileName:  mediaFileName ?? 'arquivo',
            caption:   texto || undefined,
            mediaUrl,
          })
        : await sendHumanLike(cfg, conversa.remoteJid, texto)
      const ultima = await prisma.mensagemIA.findFirst({
        where: { conversaId: id, role: 'assistant' },
        orderBy: { criadaEm: 'desc' },
      })
      if (ultima) {
        await prisma.mensagemIA.update({
          where: { id: ultima.id },
          data: { status: result.ok ? 'sent' : 'failed' },
        })
      }
    }
  }

  // Canal portal — mensagem já salva no banco, atualiza conversa e marca como sent
  await Promise.all([
    prisma.conversaIA.update({
      where: { id },
      data:  { atualizadaEm: new Date() },
    }),
    prisma.mensagemIA.updateMany({
      where: { conversaId: id, role: 'assistant', status: 'pending' },
      data:  { status: 'sent' },
    }),
  ])

  // Notifica o portal Clara via SSE (substitui setInterval de 5s)
  emitConversaMensagem(id, { role: 'assistant', conteudo: texto || '', mediaUrl })

  return NextResponse.json({ ok: true })
}
