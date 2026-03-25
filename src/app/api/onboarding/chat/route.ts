import { NextResponse } from 'next/server'
import { askAI } from '@/lib/ai/ask'
import type { AIMessage } from '@/lib/ai/providers'

const SYSTEM_ONBOARDING = `Você está auxiliando um potencial cliente durante o processo de cadastro na ContabAI.
O objetivo é tirar dúvidas sobre planos, regime tributário, processo de contratação e o que está incluso em cada serviço.
Seja acolhedor e encoraje o cadastro quando pertinente.
Não colete dados sensíveis pelo chat — oriente o cliente a preencher os campos do formulário.`

export async function POST(req: Request) {
  const { message, history, leadId } = await req.json() as {
    message: string
    history: AIMessage[]
    leadId?: string
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
        body: JSON.stringify({ message, history }),
      })
      const data = await res.json()
      return NextResponse.json({ reply: data.reply ?? data.text ?? data.output ?? 'Sem resposta.' })
    } catch {
      // Fallback para IA direta se n8n falhar
    }
  }

  const context = leadId
    ? { escopo: 'lead+global' as const, leadId }
    : { escopo: 'global' as const }

  const { resposta } = await askAI({
    pergunta: message,
    context,
    feature: 'onboarding',
    historico: history,
    systemExtra: SYSTEM_ONBOARDING,
    tipos: ['base_conhecimento', 'fiscal_normativo'],
    maxTokens: 512,
  })

  return NextResponse.json({ reply: resposta })
}
