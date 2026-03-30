import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { sendText, sendMedia } from '@/lib/evolution'
import { getProvider } from '@/lib/ai/providers'
import { getAiConfig } from '@/lib/ai/config'
import { SYSTEM_BASE_DEFAULT } from '@/lib/ai/ask'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { emitEscalacaoResolvida } from '@/lib/event-bus'
import { sendPushToCliente } from '@/lib/push'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const tipo = (session.user as any)?.tipo
  if (tipo !== 'admin' && tipo !== 'contador') {
    return NextResponse.json({ error: 'Apenas contadores e admins podem responder escalações' }, { status: 403 })
  }

  const { id } = await params
  const { modo, conteudo, mediaUrl, mediaType, mediaFileName, mediaMimeType } = await req.json() as {
    modo: 'ia' | 'direto'
    conteudo: string
    mediaUrl?: string
    mediaType?: 'image' | 'document'
    mediaFileName?: string
    mediaMimeType?: string
  }

  const hasMedia = !!mediaUrl && !!mediaType && !!mediaFileName && !!mediaMimeType
  if (!modo || (!conteudo?.trim() && !hasMedia)) {
    return NextResponse.json({ error: 'modo e conteudo são obrigatórios' }, { status: 400 })
  }

  const esc = await prisma.escalacao.findUnique({ where: { id } })
  if (!esc) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (esc.status === 'resolvida') {
    return NextResponse.json({ error: 'escalação já resolvida' }, { status: 409 })
  }

  let mensagemFinal = conteudo.trim()

  // ── Modo IA: reformula no tom da assistente ──────────────────────────────────
  if (modo === 'ia') {
    try {
      const config = await getAiConfig()
      const provider = getProvider(config.provider)
      const nomeIa = (esc.canal === 'whatsapp' ? config.nomeAssistentes.whatsapp : config.nomeAssistentes.onboarding) ?? 'Assistente'
      const historico = (esc.historico as { role: string; content: string }[]) ?? []
      const ctxStr = historico
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'Cliente' : nomeIa}: ${m.content}`)
        .join('\n')

      const systemReformula = `${SYSTEM_BASE_DEFAULT}

Você receberá uma orientação de um membro da equipe e deve reformulá-la no seu tom natural de assistente ${nomeIa} — cordial, direto e em português brasileiro. NÃO mencione que recebeu orientação de alguém. Responda como se fosse sua própria resposta.`

      const result = await provider.complete({
        system: systemReformula,
        messages: [
          {
            role: 'user',
            content: `Contexto da conversa recente:\n${ctxStr}\n\nOrientação da equipe: ${conteudo}\n\nReformule no seu tom para enviar ao cliente.`,
          },
        ],
        maxTokens: 512,
        temperature: 0.4,
        model: config.models.whatsapp ?? config.models.onboarding,
        apiKey:
          config.provider === 'claude'  ? config.anthropicApiKey ?? undefined :
          config.provider === 'google'  ? config.googleApiKey    ?? undefined :
                                          config.openaiApiKey    ?? undefined,
      })
      mensagemFinal = result.text
    } catch (err) {
      console.error('[escalacoes/responder] erro ao reformular:', err)
      // Se a reformulação falhar, usa o conteúdo original
    }
  }

  // ── Envia pelo canal correto ────────────────────────────────────────────────
  if (esc.canal === 'whatsapp' && esc.remoteJid) {
    const row = await prisma.escritorio.findFirst({
      select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
    })
    if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
      const rawKey = row.evolutionApiKey
      const apiKey = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey
      const evoCfg = { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance }

      let sendResult
      if (hasMedia) {
        sendResult = await sendMedia(evoCfg, esc.remoteJid, {
          mediatype: mediaType!,
          mimetype:  mediaMimeType!,
          fileName:  mediaFileName!,
          caption:   mensagemFinal || undefined,
          mediaUrl:  mediaUrl!,
        })
      } else {
        sendResult = await sendText(evoCfg, esc.remoteJid, mensagemFinal)
      }

      if (!sendResult.ok) {
        console.error('[escalacoes/responder] falha ao enviar WhatsApp:', sendResult.error)
        return NextResponse.json(
          { error: 'erro ao enviar mensagem', detail: sendResult.error },
          { status: 502 },
        )
      }

      // Persiste a resposta no histórico da conversa
      const conversaRow = await prisma.conversaIA.findFirst({
        where: { canal: 'whatsapp', remoteJid: esc.remoteJid },
        orderBy: { atualizadaEm: 'desc' },
        select: { id: true },
      })
      if (conversaRow) {
        prisma.mensagemIA.create({
          data: {
            conversaId: conversaRow.id,
            role: 'assistant',
            conteudo: mensagemFinal,
            status: 'sent',
            tentativas: 1,
          },
        }).catch(() => {})
      }
    }
  }
  // Canal onboarding: a resposta fica em respostaEnviada — o widget faz poll e exibe

  // ── Atualiza escalação + despausa conversa WhatsApp ────────────────────────
  const escAtualizada = await prisma.escalacao.update({
    where: { id },
    data: {
      status: 'resolvida',
      operadorId: session.user.id,
      orientacaoHumana: conteudo,
      respostaEnviada: mensagemFinal,
    },
  })

  // Ao resolver a escalação, reativa a IA (despausa conversa)
  if (esc.canal === 'whatsapp' && esc.remoteJid) {
    prisma.conversaIA.updateMany({
      where: { canal: 'whatsapp', remoteJid: esc.remoteJid, NOT: { pausadaEm: null } },
      data: { pausadaEm: null, pausadoPorId: null },
    }).catch(() => {})
  }
  // Onboarding/portal: despausa via conversaIAId (se vinculada)
  if (esc.canal !== 'whatsapp' && escAtualizada.conversaIAId) {
    prisma.conversaIA.update({
      where: { id: escAtualizada.conversaIAId },
      data: { pausadaEm: null, pausadoPorId: null },
    }).catch(() => {})
  }

  // Notifica widgets via SSE (substitui poll de 4s)
  emitEscalacaoResolvida(id, { status: 'resolvida', resposta: mensagemFinal })

  // Push para cliente portal/onboarding — WhatsApp já entrega pela Evolution API
  if (esc.canal !== 'whatsapp' && esc.clienteId) {
    sendPushToCliente(esc.clienteId, {
      title: 'Resposta da equipe',
      body:  mensagemFinal.slice(0, 100),
      url:   '/portal/suporte',
    }).catch(() => {})
  }

  // Indexa escalação resolvida no RAG (contexto de atendimento para futuras consultas)
  indexarAsync('escalacao', {
    id:               escAtualizada.id,
    clienteId:        escAtualizada.clienteId,
    leadId:           escAtualizada.leadId,
    canal:            escAtualizada.canal,
    motivoIA:         escAtualizada.motivoIA,
    orientacaoHumana: escAtualizada.orientacaoHumana,
    respostaEnviada:  escAtualizada.respostaEnviada,
    criadoEm:         escAtualizada.criadoEm,
  })

  return NextResponse.json({ ok: true, mensagemEnviada: mensagemFinal })
}
