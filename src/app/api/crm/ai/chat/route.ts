import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { askAI } from '@/lib/ai/ask'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'

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

  if (!message?.trim()) return NextResponse.json({ error: 'message obrigatório' }, { status: 400 })
  if (!sessionId?.trim()) return NextResponse.json({ error: 'sessionId obrigatório' }, { status: 400 })

  const conversaId = await getOrCreateConversaSession(sessionId, 'crm', { clienteId, leadId })
  const historico  = await getHistorico(conversaId)

  const context = clienteId
    ? { escopo: 'cliente+global' as const, clienteId }
    : leadId
      ? { escopo: 'lead+global' as const, leadId }
      : { escopo: 'global' as const }

  let systemExtra: string | undefined

  const whereClause = clienteId
    ? { conversa: { clienteId } }
    : leadId
      ? { conversa: { leadId } }
      : null

  if (whereClause) {
    const mensagensCanais = await prisma.mensagemIA.findMany({
      where: { conversa: { OR: [{ clienteId }, { leadId }].filter(x => Object.values(x)[0] != null) } },
      orderBy: { criadaEm: 'asc' },
      take: 60,
      select: { role: true, conteudo: true, criadaEm: true, conversa: { select: { canal: true } } },
    })

    if (mensagensCanais.length > 0) {
      const linhas = mensagensCanais.map(m => {
        const autor = m.role === 'user' ? 'Cliente' : 'Clara'
        return `${autor} (${m.conversa.canal}): ${m.conteudo}`
      })
      systemExtra = `HISTÓRICO DE CONVERSAS DO CLIENTE (todos os canais — últimas mensagens):\n${linhas.join('\n')}`
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
