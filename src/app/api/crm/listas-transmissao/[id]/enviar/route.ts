import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { buildRemoteJid, isMediaUrlTrusted, WHATSAPP_ALLOWED_MIME } from '@/lib/whatsapp-utils'
import * as Sentry from '@sentry/nextjs'

type Ctx = { params: Promise<{ id: string }> }

/** POST — Disparar envio de broadcast para todos os membros da lista */
export async function POST(req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id: listaId } = await ctx.params

  try {
    const body = await req.json()
    const conteudo      = typeof body.conteudo === 'string' ? body.conteudo.trim() : ''
    const mediaUrl      = (body.mediaUrl as string | undefined) ?? null
    const mediaType     = (body.mediaType as string | undefined) ?? null
    const mediaFileName = (body.mediaFileName as string | undefined) ?? null
    const mediaMimeType = (body.mediaMimeType as string | undefined) ?? null

    if (!conteudo && !mediaUrl) {
      return NextResponse.json({ error: 'Conteúdo ou arquivo obrigatório' }, { status: 400 })
    }

    // Validação de mídia (mesmo padrão das rotas de WhatsApp individual)
    if (mediaUrl) {
      if (!isMediaUrlTrusted(mediaUrl)) {
        return NextResponse.json({ error: 'URL de mídia não permitida' }, { status: 400 })
      }
      if (!mediaMimeType || !WHATSAPP_ALLOWED_MIME.has(mediaMimeType)) {
        return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 })
      }
    }

    // Verificar se já existe envio em processamento para esta lista (rate limit)
    const envioRecente = await prisma.envioTransmissao.findFirst({
      where: {
        listaId,
        status: 'processando',
      },
    })
    if (envioRecente) {
      return NextResponse.json({ error: 'Já existe um envio em andamento para esta lista. Aguarde a conclusão.' }, { status: 429 })
    }

    // Buscar membros com seus telefones
    const lista = await prisma.listaTransmissao.findUnique({
      where: { id: listaId },
      include: {
        membros: {
          include: {
            cliente: { select: { id: true, whatsapp: true, telefone: true } },
            socio: { select: { id: true, whatsapp: true, telefone: true } },
          },
        },
      },
    })

    if (!lista) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
    if (lista.membros.length === 0) {
      return NextResponse.json({ error: 'Lista sem membros. Adicione membros antes de enviar.' }, { status: 400 })
    }

    // Resolver remoteJid para cada membro — filtrar os que não têm número válido
    const destinatariosData = lista.membros
      .map(m => {
        const phone = m.cliente?.whatsapp ?? m.cliente?.telefone ?? m.socio?.whatsapp ?? m.socio?.telefone
        if (!phone) return null
        const remoteJid = buildRemoteJid(phone)
        if (!remoteJid) return null
        return {
          clienteId: m.clienteId,
          socioId: m.socioId,
          remoteJid,
        }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)

    if (destinatariosData.length === 0) {
      return NextResponse.json({ error: 'Nenhum membro com número de WhatsApp válido.' }, { status: 400 })
    }

    // Criar envio + destinatários em transação
    const envio = await prisma.envioTransmissao.create({
      data: {
        listaId,
        operadorId: session.user.id,
        conteudo,
        mediaUrl,
        mediaType,
        mediaFileName,
        mediaMimeType,
        totalMembros: destinatariosData.length,
        destinatarios: {
          create: destinatariosData.map(d => ({
            clienteId: d.clienteId,
            socioId: d.socioId,
            remoteJid: d.remoteJid,
          })),
        },
      },
      select: {
        id: true,
        totalMembros: true,
        status: true,
        criadoEm: true,
      },
    })

    return NextResponse.json({
      envio,
      mensagem: `Broadcast enfileirado para ${destinatariosData.length} destinatário(s). O envio será processado em instantes.`,
    }, { status: 202 })
  } catch (err) {
    console.error('[listas-transmissao] erro ao disparar envio:', err)
    Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'enviar' }, extra: { listaId } })
    return NextResponse.json({ error: 'Erro ao disparar envio' }, { status: 500 })
  }
}
