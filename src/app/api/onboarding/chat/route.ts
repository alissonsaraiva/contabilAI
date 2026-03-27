import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { askAI, detectarEscalacao } from '@/lib/ai/ask'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const MSG_MAX_LENGTH = 2000

export async function POST(req: Request) {
  const { message, sessionId, leadId } = await req.json() as {
    message:    string
    sessionId?: string
    leadId?:    string
  }

  if (!message?.trim() || message.length > MSG_MAX_LENGTH) {
    return NextResponse.json({ reply: '' })
  }

  // Rate limit: 30 mensagens por sessão/IP por hora
  const ip = getClientIp(req)
  const rlKey = sessionId ? `chat:session:${sessionId}` : `chat:ip:${ip}`
  const rl = rateLimit(rlKey, 30, 60 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ reply: 'Limite de mensagens atingido. Aguarde alguns minutos antes de continuar.' })
  }

  // Se n8n estiver configurado, delega para ele (permite automações avançadas)
  const n8nUrl = process.env.N8N_CHAT_WEBHOOK_URL
  if (n8nUrl) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000) // 10s timeout
      const res = await fetch(n8nUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message, sessionId, leadId }),
        signal:  controller.signal,
      }).finally(() => clearTimeout(timeout))
      const data = await res.json()
      const reply = data.reply ?? data.text ?? data.output ?? ''
      if (reply.trim()) {
        return NextResponse.json({ reply })
      }
      // n8n retornou vazio — cai para IA direta
    } catch {
      // Timeout ou falha de rede — fallback para IA direta
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

  // ── Verifica se conversa está pausada (humano assumiu o controle) ─────────
  if (conversaId) {
    const conversaRow = await prisma.conversaIA.findUnique({
      where: { id: conversaId },
      select: { pausadaEm: true },
    })
    if (conversaRow?.pausadaEm) {
      // Salva mensagem do lead e cria escalação para o widget fazer poll
      const historicoEscalacao = [
        ...historico,
        { role: 'user' as const, content: message },
      ]
      let escalacaoId: string | undefined
      try {
        // Reutiliza escalação aberta (pendente/em_atendimento) se existir
        const existente = await prisma.escalacao.findFirst({
          where: {
            canal: 'onboarding',
            status: { in: ['pendente', 'em_atendimento'] },
            ...(leadId ? { leadId } : { sessionId: sessionId ?? undefined }),
          },
          orderBy: { criadoEm: 'desc' },
        })
        if (existente) {
          escalacaoId = existente.id
          await prisma.escalacao.update({
            where: { id: existente.id },
            data: { ultimaMensagem: message, historico: historicoEscalacao as object[] },
          })
        } else {
          const esc = await prisma.escalacao.create({
            data: {
              canal:          'onboarding',
              status:         'em_atendimento',
              leadId:         leadId    ?? null,
              sessionId:      sessionId ?? null,
              historico:      historicoEscalacao as object[],
              ultimaMensagem: message,
              motivoIA:       'Conversa assumida por humano',
            },
          })
          escalacaoId = esc.id
        }
      } catch (err) {
        console.error('[onboarding/chat] erro ao criar escalação pausada:', err)
      }
      // Salva mensagem do usuário no histórico
      if (conversaId) {
        prisma.mensagemIA.create({
          data: { conversaId, role: 'user', conteudo: message },
        }).catch(() => {})
      }
      return NextResponse.json({
        reply: 'Aguarde um momento, um especialista está verificando sua mensagem...',
        escalado: true,
        escalacaoId,
      })
    }
  }

  // ── Contexto fixo: fluxo de onboarding ───────────────────────────────────
  const FLUXO_ONBOARDING = `FLUXO DE CADASTRO (etapas em ordem):
1. Simulador — o lead simula impostos e descobre o regime ideal
2. Escolha do plano — seleciona o plano de contabilidade
3. Dados pessoais/empresariais — preenche nome, CPF/CNPJ, endereço, regime tributário
4. Revisão — confere os dados antes de gerar o contrato
5. Contrato — contrato gerado automaticamente; enviado por e-mail via DocuSeal para assinatura eletrônica
6. Confirmação — página exibe status "aguardando assinatura"; lead recebe e-mail com link para assinar (válido 24h)
7. Após assinar — conta ativada automaticamente; e-mail de boas-vindas enviado com link de acesso ao Portal do Cliente
8. Portal do Cliente — lead vira cliente ativo; acessa documentos, financeiro, suporte e chat com a equipe

REGRAS PARA RESPONDER SOBRE O FLUXO:
• Se o lead perguntar "o que acontece depois?" ou "qual é o próximo passo?", guie pela etapa seguinte com base no status atual
• Se perguntar sobre o portal, explique que o acesso chega por e-mail logo após a assinatura
• Se perguntar sobre o contrato, explique que é enviado por e-mail para assinatura eletrônica (DocuSeal) — não precisa imprimir nada
• Se perguntar sobre prazo de ativação, informe que é imediato após a assinatura`

  // ── Contexto direto do lead (não depende do RAG) ──────────────────────────
  let systemExtra: string = FLUXO_ONBOARDING
  if (leadId) {
    try {
      const lead = await prisma.lead.findUnique({
        where:  { id: leadId },
        select: { planoTipo: true, dadosJson: true, status: true },
      })
      if (lead) {
        const dados = (lead.dadosJson ?? {}) as Record<string, string>
        const nome = dados['Nome completo'] ?? dados['Razão Social'] ?? null
        const partes = [
          `\nCONTEXTO DO LEAD EM ATENDIMENTO:`,
          nome                       ? `• Nome: ${nome}` : null,
          lead.planoTipo             ? `• Plano selecionado: ${lead.planoTipo}` : null,
          dados['Regime Tributário'] ? `• Regime: ${dados['Regime Tributário']}` : null,
          dados['Cidade']            ? `• Cidade: ${dados['Cidade']}` : null,
          lead.status                ? `• Status no fluxo: ${lead.status}` : null,
        ].filter(Boolean)
        if (partes.length > 1) systemExtra += '\n' + partes.join('\n')
      }
    } catch { /* DB indisponível — continua só com o fluxo */ }
  }

  // ── Escopo RAG ────────────────────────────────────────────────────────────
  const context = leadId
    ? { escopo: 'lead+global' as const, leadId }
    : { escopo: 'global' as const }

  let respostaRaw: string
  try {
    const result = await askAI({
      pergunta:   message,
      context,
      feature:    'onboarding',
      historico,
      systemExtra,
      tipos:      ['base_conhecimento', 'fiscal_normativo'],
      maxTokens:  512,
    })
    respostaRaw = result.resposta
  } catch (aiErr) {
    const aiErrMsg = (aiErr as Error).message ?? String(aiErr)
    console.error('[onboarding/chat] IA indisponível:', aiErrMsg)
    // Cria escalação para o CRM atender o lead manualmente
    let escalacaoId: string | undefined
    try {
      const esc = await prisma.escalacao.create({
        data: {
          canal:          'onboarding',
          status:         'pendente',
          leadId:         leadId    ?? null,
          sessionId:      sessionId ?? null,
          historico:      [...historico, { role: 'user', content: message }] as object[],
          ultimaMensagem: message,
          motivoIA:       `IA indisponível: ${aiErrMsg}`,
        },
      })
      escalacaoId = esc.id
    } catch (err) {
      console.error('[onboarding/chat] erro ao criar escalação de falha IA:', err)
    }
    // Notifica equipe no sino do CRM
    import('@/lib/notificacoes')
      .then(({ notificarAgenteFalhou }) => notificarAgenteFalhou(aiErrMsg))
      .catch(() => {})
    // Retorna mensagem amigável e inicia poll para o lead aguardar humano
    return NextResponse.json({
      reply: 'Estou com uma instabilidade no momento. Um especialista da nossa equipe já foi notificado e irá responder em breve.',
      escalado: !!escalacaoId,
      escalacaoId,
    })
  }

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
