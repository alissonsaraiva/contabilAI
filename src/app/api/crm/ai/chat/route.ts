import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { askAI } from '@/lib/ai/ask'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'
import { rateLimit } from '@/lib/rate-limit'

const MSG_MAX_LENGTH = 4000

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { message, sessionId, clienteId, leadId } = await req.json() as {
    message:   string
    sessionId: string
    clienteId?: string
    leadId?:    string
  }

  if (!message?.trim() || message.length > MSG_MAX_LENGTH) {
    return NextResponse.json({ error: 'message inválido ou muito longo' }, { status: 400 })
  }
  if (!sessionId?.trim()) return NextResponse.json({ error: 'sessionId obrigatório' }, { status: 400 })

  // Rate limit: 60 mensagens por sessão por hora (usuários autenticados têm limite maior)
  const rl = rateLimit(`crm-chat:${sessionId}`, 60, 60 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Limite de mensagens atingido. Aguarde alguns minutos.' }, { status: 429 })
  }

  const conversaId = await getOrCreateConversaSession(sessionId, 'crm', { clienteId, leadId })
  const historico  = await getHistorico(conversaId)

  const context = clienteId
    ? { escopo: 'cliente+global' as const, clienteId }
    : leadId
      ? { escopo: 'lead+global' as const, leadId }
      : { escopo: 'global' as const }

  // Contexto de uso interno: contador ou admin usando o painel CRM
  // O CRM tem acesso legítimo a todos os clientes — sem restrição cross-client
  const escopoLabel = clienteId
    ? `cliente ID ${clienteId}`
    : leadId
      ? `lead ID ${leadId}`
      : 'escopo geral do escritório'

  let systemExtra = `CONTEXTO DE USO: Você está sendo consultado por um membro interno da equipe contábil (contador ou admin) via painel CRM. Responda de forma técnica e detalhada. O usuário tem acesso completo à base de clientes do escritório.

FOCO ATUAL: ${escopoLabel}. Priorize informações deste contexto, mas pode consultar e comparar com outros clientes quando isso for útil para a análise.`

  const whereClause = clienteId
    ? { conversa: { clienteId } }
    : leadId
      ? { conversa: { leadId } }
      : null

  if (whereClause) {
    const orConditions = [
      clienteId ? { clienteId } : null,
      leadId    ? { leadId }    : null,
    ].filter(Boolean) as Array<{ clienteId?: string; leadId?: string }>

    const mensagensCanais = await prisma.mensagemIA.findMany({
      where: { conversa: { OR: orConditions } },
      orderBy: { criadaEm: 'asc' },
      take: 60,
      select: { role: true, conteudo: true, criadaEm: true, conversa: { select: { canal: true } } },
    })

    if (mensagensCanais.length > 0) {
      const linhas = mensagensCanais.map((m: { role: string; conteudo: string; criadaEm: Date; conversa: { canal: string } }) => {
        const autor = m.role === 'user' ? 'Cliente' : 'Clara'
        return `${autor} (${m.conversa.canal}): ${m.conteudo}`
      })
      systemExtra += `\n\nHISTÓRICO DE CONVERSAS DO CLIENTE (todos os canais — últimas mensagens):\n${linhas.join('\n')}`
    }
  }

  const { resposta, provider, model } = await askAI({
    pergunta:   message,
    context,
    feature:    'crm',
    historico,
    systemExtra,
    maxTokens:  1024,
  })

  addMensagens(conversaId, message, resposta)

  return NextResponse.json({ reply: resposta, provider, model })
}
