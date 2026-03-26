import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { sendText } from '@/lib/evolution'
import { getProvider } from '@/lib/ai/providers'
import { getAiConfig } from '@/lib/ai/config'
import { SYSTEM_BASE_DEFAULT } from '@/lib/ai/ask'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const tipo = (session.user as any)?.tipo
  if (tipo !== 'admin' && tipo !== 'contador') {
    return NextResponse.json({ error: 'Apenas contadores e admins podem responder escalações' }, { status: 403 })
  }

  const { id } = await params
  const { modo, conteudo } = await req.json() as { modo: 'ia' | 'direto'; conteudo: string }

  if (!modo || !conteudo?.trim()) {
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
      const sendResult = await sendText(
        { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance },
        esc.remoteJid,
        mensagemFinal,
      )
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

  // Ao resolver a escalação, reativa a IA para o número (se conversa estiver pausada)
  if (esc.canal === 'whatsapp' && esc.remoteJid) {
    prisma.conversaIA.updateMany({
      where: { canal: 'whatsapp', remoteJid: esc.remoteJid, NOT: { pausadaEm: null } },
      data: { pausadaEm: null, pausadoPorId: null },
    }).catch(() => {})
  }

  // Indexa escalação resolvida no RAG (contexto de atendimento para futuras consultas)
  import('@/lib/rag/ingest').then(({ indexarEscalacao }) =>
    indexarEscalacao({
      id:               escAtualizada.id,
      clienteId:        escAtualizada.clienteId,
      leadId:           escAtualizada.leadId,
      canal:            escAtualizada.canal,
      motivoIA:         escAtualizada.motivoIA,
      orientacaoHumana: escAtualizada.orientacaoHumana,
      respostaEnviada:  escAtualizada.respostaEnviada,
      criadoEm:         escAtualizada.criadoEm,
    })
  ).catch(() => {})

  return NextResponse.json({ ok: true, mensagemEnviada: mensagemFinal })
}
