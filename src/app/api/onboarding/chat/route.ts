import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { askAI, detectarEscalacao } from '@/lib/ai/ask'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { indexarAsync } from '@/lib/rag/indexar-async'

const MSG_MAX_LENGTH = 2000

export async function POST(req: Request) {
  const { message, sessionId, leadId, plano } = await req.json() as {
    message:    string
    sessionId?: string
    leadId?:    string
    plano?:     string
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
          indexarAsync('escalacao', {
            id:      esc.id,
            leadId:  esc.leadId,
            canal:   'onboarding',
            motivoIA: esc.motivoIA,
            criadoEm: esc.criadoEm,
          })
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

  // ── Contexto direto do lead (não depende do RAG) ──────────────────────────
  // O fluxo de etapas e regras de atendimento ficam no system prompt do CRM
  // (Configurações → IA → Prompts → Onboarding) — editável sem deploy.
  // Aqui só injetamos dados dinâmicos buscados do banco por request.
  let systemExtra: string | undefined

  // Busca planos ativos para que a IA possa informar valores sem inventar
  let planosExtra = ''
  try {
    const planos = await prisma.plano.findMany({
      where:   { ativo: true },
      orderBy: { valorMinimo: 'asc' },
      select:  { nome: true, valorMinimo: true, valorMaximo: true, servicos: true, destaque: true },
    })
    if (planos.length > 0) {
      const linhas = planos.map(p => {
        const faixa = p.valorMaximo && Number(p.valorMaximo) !== Number(p.valorMinimo)
          ? `R$${Number(p.valorMinimo).toFixed(0)} a R$${Number(p.valorMaximo).toFixed(0)}/mês`
          : `R$${Number(p.valorMinimo).toFixed(0)}/mês`
        const servicos = Array.isArray(p.servicos) && (p.servicos as string[]).length > 0
          ? ` — inclui: ${(p.servicos as string[]).join(', ')}`
          : ''
        const destaque = p.destaque ? ' (destaque)' : ''
        return `• ${p.nome}${destaque}: ${faixa}${servicos}`
      })
      planosExtra = `\nPLANOS DISPONÍVEIS (use estes valores exatos ao ser perguntado sobre preços):\n${linhas.join('\n')}`
    }
  } catch { /* DB indisponível — continua sem planos */ }

  if (leadId) {
    try {
      const lead = await prisma.lead.findUnique({
        where:  { id: leadId },
        select: { planoTipo: true, dadosJson: true, status: true, canal: true, observacoes: true },
      })
      if (lead) {
        const dados = (lead.dadosJson ?? {}) as Record<string, unknown>

        // Campos com prioridade — apresentados primeiro com label legível
        const camposPrioritarios = [
          `CONTEXTO DO LEAD EM ATENDIMENTO:`,
          dados['Nome completo']   ? `• Nome: ${dados['Nome completo']}`         : null,
          dados['Razão Social']    ? `• Razão Social: ${dados['Razão Social']}`  : null,
          dados['CPF']             ? `• CPF: ${dados['CPF']}`                    : null,
          dados['CNPJ']            ? `• CNPJ: ${dados['CNPJ']}`                  : null,
          dados['E-mail']          ? `• E-mail: ${dados['E-mail']}`              : null,
          dados['Telefone']        ? `• Telefone: ${dados['Telefone']}`          : null,
          dados['Regime Tributário'] ? `• Regime: ${dados['Regime Tributário']}` : null,
          dados['Cidade']          ? `• Cidade: ${dados['Cidade']}`              : null,
          dados['Atividade Principal'] ? `• Atividade: ${dados['Atividade Principal']}` : null,
          (lead.planoTipo ?? plano) ? `• Plano de interesse: ${lead.planoTipo ?? plano}` : null,
          lead.status              ? `• Status no fluxo: ${lead.status}`         : null,
          lead.canal               ? `• Canal de entrada: ${lead.canal}`         : null,
          lead.observacoes         ? `• Observações: ${lead.observacoes}`        : null,
        ].filter(Boolean)

        // Campos dinâmicos restantes (formulário customizado) — excluindo os já listados
        const camposConhecidos = new Set([
          'Nome completo', 'Razão Social', 'CPF', 'CNPJ', 'E-mail', 'Telefone',
          'Regime Tributário', 'Cidade', 'Atividade Principal',
          'nome', 'email', 'cpf', 'cnpj', 'telefone', 'simulador',
        ])
        const camposDinamicos = Object.entries(dados)
          .filter(([chave, valor]) =>
            !camposConhecidos.has(chave) &&
            valor != null &&
            typeof valor !== 'object' &&
            String(valor).trim().length > 0 &&
            String(valor).trim() !== 'null'
          )
          .map(([chave, valor]) => `• ${chave}: ${String(valor).trim()}`)

        const partes = [...camposPrioritarios, ...camposDinamicos]
        if (partes.length > 1) systemExtra = partes.join('\n') + planosExtra
        else if (planosExtra)  systemExtra = planosExtra.trim()
      } else if (planosExtra) {
        systemExtra = planosExtra.trim()
      }
    } catch { /* DB indisponível — continua sem contexto extra */ }
  } else if (planosExtra) {
    systemExtra = planosExtra.trim()
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
      maxTokens:  300,
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
      indexarAsync('escalacao', {
        id:      esc.id,
        leadId:  esc.leadId,
        canal:   'onboarding',
        motivoIA: esc.motivoIA,
        criadoEm: esc.criadoEm,
      })
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
      indexarAsync('escalacao', {
        id:      esc.id,
        leadId:  esc.leadId,
        canal:   'onboarding',
        motivoIA: esc.motivoIA,
        criadoEm: esc.criadoEm,
      })
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
