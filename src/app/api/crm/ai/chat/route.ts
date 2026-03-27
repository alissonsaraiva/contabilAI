import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { askAI } from '@/lib/ai/ask'
import { getAiConfig } from '@/lib/ai/config'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'
import { rateLimit } from '@/lib/rate-limit'
import { classificarIntencao } from '@/lib/ai/classificar-intencao'
import { executarAgente } from '@/lib/ai/agent'
// Garante que todas as tools estejam registradas
import '@/lib/ai/tools'

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

  const [conversaId, aiConfig] = await Promise.all([
    getOrCreateConversaSession(sessionId, 'crm', { clienteId, leadId }),
    getAiConfig(),
  ])
  const historico  = await getHistorico(conversaId)

  const context = clienteId
    ? { escopo: 'cliente+global' as const, clienteId }
    : leadId
      ? { escopo: 'lead+global' as const, leadId }
      : { escopo: 'global' as const }

  // Contexto de uso interno: contador ou admin usando o painel CRM
  // O CRM tem acesso legítimo a todos os clientes — sem restrição cross-client

  // Resolve nome do cliente/lead para o contexto (evita expor UUID ao modelo)
  let escopoLabel = 'escopo geral do escritório'
  if (clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { nome: true, razaoSocial: true },
    })
    const nome = cliente?.razaoSocial ?? cliente?.nome
    escopoLabel = nome ? `cliente: ${nome}` : 'cliente (dados não encontrados)'
  } else if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { contatoEntrada: true, dadosJson: true },
    })
    const dados = (lead?.dadosJson ?? {}) as Record<string, string>
    const nome = dados['Nome completo'] ?? dados['Razão Social'] ?? lead?.contatoEntrada
    escopoLabel = nome ? `lead: ${nome}` : 'lead (sem dados completos ainda)'
  }

  let systemExtra = `CONTEXTO DE USO: Você está sendo consultado por um membro interno da equipe contábil (contador ou admin) via painel CRM. Responda de forma técnica e detalhada. O usuário tem acesso completo à base de clientes do escritório.

FOCO ATUAL: ${escopoLabel}. Priorize informações deste contexto, mas pode consultar e comparar com outros clientes quando isso for útil para a análise.

ACESSO A DADOS: Você tem acesso a dados em tempo real do CRM via sistema de agentes. Quando perguntas sobre leads, clientes, tarefas, prospecções ou dados específicos forem feitas, os dados reais serão fornecidos nesta conversa. NUNCA diga que não tem acesso ao banco de dados — caso os dados não tenham sido fornecidos nesta mensagem, responda com o que já sabe do histórico ou peça ao operador para repetir a pergunta.`

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
        const autor = m.role === 'user' ? 'Cliente' : (aiConfig.nomeAssistentes.crm ?? 'Assistente')
        return `${autor} (${m.conversa.canal}): ${m.conteudo}`
      })
      systemExtra += `\n\nHISTÓRICO DE CONVERSAS DO CLIENTE (todos os canais — últimas mensagens):\n${linhas.join('\n')}`
    }
  }

  // ── Classificação de intenção + delegação ao agente ──────────────────────────
  // Classifica em paralelo com nada (rápido — não bloqueia nada ainda)
  const intencao = await classificarIntencao(
    message,
    escopoLabel !== 'escopo geral do escritório' ? escopoLabel : undefined,
  )

  if (intencao.tipo === 'acao' && intencao.instrucao) {
    try {
      const resultado = await executarAgente({
        instrucao: intencao.instrucao,
        contexto: {
          clienteId,
          leadId,
          solicitanteAI: 'crm',
        },
      })

      if (resultado.acoesExecutadas.length > 0) {
        // Injeta o resultado do agente como contexto real para o askAI formular a resposta
        // Usa resultado.resposta independente de sucesso parcial — melhor do que "não tenho acesso"
        systemExtra += `\n\n--- DADOS CONSULTADOS EM TEMPO REAL ---
${resultado.resposta}
--- FIM DOS DADOS REAIS ---
Formule sua resposta baseando-se NESSES DADOS REAIS acima. Seja natural, conversacional e objetivo. Não mencione que consultou um "agente" ou "banco de dados" — apenas apresente as informações como se fossem seu conhecimento atual.`
      }
    } catch (err) {
      // Agente falhou — notifica o admin via central de notificações, não o operador no chat
      const { notificarAgenteFalhou } = await import('@/lib/notificacoes')
      notificarAgenteFalhou(err instanceof Error ? err.message : String(err)).catch(() => {})
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  let resposta: string
  let provider: string
  let model: string
  try {
    const result = await askAI({
      pergunta:   message,
      context,
      feature:    'crm',
      historico,
      systemExtra,
      maxTokens:  1024,
    })
    resposta = result.resposta
    provider = result.provider
    model    = result.model
  } catch (aiErr) {
    const aiErrMsg = (aiErr as Error).message ?? String(aiErr)
    console.error('[crm/ai/chat] IA indisponível:', aiErrMsg)
    import('@/lib/notificacoes')
      .then(({ notificarAgenteFalhou }) => notificarAgenteFalhou(aiErrMsg))
      .catch(() => {})
    return NextResponse.json({ reply: 'Estou enfrentando uma instabilidade no momento. Tente novamente em alguns instantes.' })
  }

  addMensagens(conversaId, message, resposta)

  return NextResponse.json({ reply: resposta, provider, model })
}
