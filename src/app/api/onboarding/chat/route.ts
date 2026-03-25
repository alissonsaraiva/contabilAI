import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { askAI, detectarEscalacao } from '@/lib/ai/ask'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'

export async function POST(req: Request) {
  const { message, sessionId, leadId } = await req.json() as {
    message:    string
    sessionId?: string
    leadId?:    string
  }

  if (!message?.trim()) {
    return NextResponse.json({ reply: '' })
  }

  // Se n8n estiver configurado, delega para ele (permite automações avançadas)
  const n8nUrl = process.env.N8N_CHAT_WEBHOOK_URL
  if (n8nUrl) {
    try {
      const res = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId, leadId }),
      })
      const data = await res.json()
      return NextResponse.json({ reply: data.reply ?? data.text ?? data.output ?? 'Sem resposta.' })
    } catch {
      // Fallback para IA direta se n8n falhar
    }
  }

  // ── Histórico persistido ───────────────────────────────────────────────────
  let historico: Awaited<ReturnType<typeof getHistorico>> = []
  let conversaId: string | undefined

  if (sessionId) {
    try {
      conversaId = await getOrCreateConversaSession(sessionId, 'onboarding', { leadId })
      historico  = await getHistorico(conversaId)
    } catch {
      // DB indisponível — continua sem histórico
    }
  }

  // ── Escopo RAG ────────────────────────────────────────────────────────────
  const context = leadId
    ? { escopo: 'lead+global' as const, leadId }
    : { escopo: 'global' as const }

  const { resposta: respostaRaw } = await askAI({
    pergunta:  message,
    context,
    feature:   'onboarding',
    historico,
    tipos:     ['base_conhecimento', 'fiscal_normativo'],
    maxTokens: 512,
  })

  // ── Detecta escalação ##HUMANO## ──────────────────────────────────────────
  const escalInfo = detectarEscalacao(respostaRaw)
  if (escalInfo.escalado) {
    const historicoEscalacao = [
      ...historico,
      { role: 'user' as const,      content: message },
      { role: 'assistant' as const, content: escalInfo.textoLimpo },
    ]
    let escalacaoId: string | undefined
    try {
      const esc = await prisma.escalacao.create({
        data: {
          canal:          'onboarding',
          status:         'pendente',
          leadId:         leadId    ?? null,
          sessionId:      sessionId ?? null,
          historico:      historicoEscalacao as object[],
          ultimaMensagem: message,
          motivoIA:       escalInfo.motivo,
        },
      })
      escalacaoId = esc.id
    } catch (err) {
      console.error('[onboarding/chat] erro ao criar escalação:', err)
    }

    if (conversaId) addMensagens(conversaId, message, escalInfo.textoLimpo)

    return NextResponse.json({ reply: escalInfo.textoLimpo, escalado: true, escalacaoId })
  }

  // ── Persiste no banco ─────────────────────────────────────────────────────
  if (conversaId) addMensagens(conversaId, message, respostaRaw)

  return NextResponse.json({ reply: respostaRaw })
}
