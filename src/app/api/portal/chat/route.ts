import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { askAI, detectarEscalacao } from '@/lib/ai/ask'
import { getAiConfig } from '@/lib/ai/config'
import { getOrCreateConversaSession, getHistorico, addMensagens, addMensagemUsuario } from '@/lib/ai/conversa'
import { classificarIntencao } from '@/lib/ai/classificar-intencao'
import { executarAgente } from '@/lib/ai/agent'
import { rateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { emitPortalUserMessage } from '@/lib/event-bus'
import { indexarAsync } from '@/lib/rag/indexar-async'
// Garante que todas as tools estejam registradas
import '@/lib/ai/tools'

const MSG_MAX_LENGTH = 2000

// GET — carrega histórico de uma sessão existente para restaurar o chat na UI
export async function GET(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ mensagens: [] })

  const conversa = await prisma.conversaIA.findFirst({
    where:   { sessionId, canal: 'portal' },
    orderBy: { atualizadaEm: 'desc' },
    select:  {
      id:        true,
      pausadaEm: true,
      mensagens: {
        orderBy: { criadaEm: 'asc' },
        select:  { role: true, conteudo: true },
      },
    },
  })

  return NextResponse.json({
    conversaId: conversa?.id ?? null,
    mensagens:  conversa?.mensagens ?? [],
    pausada:    conversa ? Boolean(conversa.pausadaEm) : false,
  })
}

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any

  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const empresaId: string = user.empresaId
  const isSocio = user.tipo === 'socio'
  const sessionUserId: string = user.id

  const { message, sessionId } = await req.json() as { message: string; sessionId: string }

  if (!message?.trim() || message.length > MSG_MAX_LENGTH) {
    return NextResponse.json({ error: 'message inválido' }, { status: 400 })
  }
  if (!sessionId?.trim()) {
    return NextResponse.json({ error: 'sessionId obrigatório' }, { status: 400 })
  }

  // Rate limit: 30 msgs por hora por usuário (titular ou sócio)
  const rl = rateLimit(`portal-chat:${sessionUserId}`, 30, 60 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Limite de mensagens atingido. Tente novamente em alguns minutos.' }, { status: 429 })
  }

  // Para sócios: re-valida no DB que o sócio ainda pertence à empresa do token
  if (isSocio) {
    const socioAtivo = await prisma.socio.findFirst({
      where: { id: sessionUserId, empresaId, portalAccess: true },
      select: { id: true },
    })
    if (!socioAtivo) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 })
    }
  }

  // Busca dados do titular da empresa para contexto da IA
  const clienteTitular = await prisma.cliente.findUnique({
    where:  { empresaId },
    select: { id: true, nome: true, planoTipo: true, valorMensal: true, vencimentoDia: true, cidade: true, uf: true, status: true, empresa: { select: { regime: true } } },
  })

  // Para sócios, vincula conversa ao clienteId do titular; titulares usam o próprio id.
  // Se sócio sem empresa encontrada, bloqueia para evitar contexto de cliente indefinido.
  if (isSocio && !clienteTitular) {
    console.warn('[portal/chat] Sócio sem cliente titular vinculado à empresa, socioId:', sessionUserId, 'empresaId:', empresaId)
    return NextResponse.json({
      reply: 'O cadastro da sua empresa ainda está sendo configurado pela equipe. Em breve você terá acesso completo ao chat. Se precisar de ajuda urgente, entre em contato diretamente com o escritório.',
    })
  }
  const clienteIdParaConversa = isSocio ? clienteTitular!.id : sessionUserId

  // RISCO-3: Para sócios, carrega dados específicos do sócio para injetar no contexto
  let dadosSocio: { nome: string; email?: string | null; qualificacao?: string | null; participacao?: unknown } | null = null
  if (isSocio) {
    dadosSocio = await prisma.socio.findUnique({
      where: { id: sessionUserId },
      select: { nome: true, email: true, qualificacao: true, participacao: true },
    }).catch(() => null)
  }

  const [conversaId, aiConfig, escritorio] = await Promise.all([
    getOrCreateConversaSession(sessionId, 'portal', { clienteId: clienteIdParaConversa }),
    getAiConfig(),
    prisma.escritorio.findFirst({ select: { nome: true } }),
  ])

  // ── Guarda pausada ANTES de chamar a IA — se pausada, só salva msg do usuário ──
  const conversaStatus = await prisma.conversaIA.findUnique({
    where: { id: conversaId },
    select: { pausadaEm: true },
  })

  if (conversaStatus?.pausadaEm) {
    await addMensagemUsuario(conversaId, message)
    emitPortalUserMessage(conversaId)
    return NextResponse.json({
      reply:      'Sua mensagem foi recebida. Um especialista da equipe vai responder aqui em breve. 👆',
      conversaId,
      pausada:    true,
    })
  }
  // ────────────────────────────────────────────────────────────────────────────

  const historico = await getHistorico(conversaId)
  const nomeCara       = aiConfig.nomeAssistentes.portal ?? 'Clara'
  const nomeEscritorio = escritorio?.nome ?? process.env.NEXT_PUBLIC_APP_NAME ?? 'Avos'
  const nomeUsuario    = user.name ?? clienteTitular?.nome ?? 'cliente'

  let systemExtra = `Você é ${nomeCara}, assistente automatizado do escritório ${nomeEscritorio}. Você está atendendo ${nomeUsuario}${isSocio ? ' (sócio da empresa)' : ''} pelo portal online do escritório.

IDENTIDADE:
- Não anuncie proativamente que é um sistema automatizado — use seu nome e foque em ajudar.
- Se perguntarem diretamente "você é uma IA?", "estou falando com um robô?" ou similar: confirme de forma simples e continue o atendimento normalmente. Exemplo: "Sim, sou um assistente automatizado do ${nomeEscritorio}. Mas posso te ajudar com a maioria das dúvidas aqui. O que você precisa?"
- Se o cliente pedir explicitamente para falar com um humano, ou se a situação claramente exigir julgamento humano, acione ##HUMANO##.
- Não use frases como "como IA, não posso..." — use linguagem natural e direta.
- Se não souber responder algo, diga que vai verificar com a equipe.

DADOS DA EMPRESA:
- Plano: ${clienteTitular?.planoTipo ?? 'não informado'}
- Valor mensalidade: R$ ${clienteTitular?.valorMensal ?? '—'}
- Vencimento dia: ${clienteTitular?.vencimentoDia ?? '—'}
- Regime tributário: ${clienteTitular?.empresa?.regime ?? 'não informado'}
- Localidade: ${clienteTitular?.cidade ?? ''}${clienteTitular?.uf ? '/' + clienteTitular.uf : ''}
- Status financeiro: ${clienteTitular?.status === 'inadimplente' ? 'INADIMPLENTE — mensalidade em atraso' : clienteTitular?.status === 'suspenso' ? 'SUSPENSO' : clienteTitular?.status === 'cancelado' ? 'CANCELADO' : 'em dia'}

ACESSO A DADOS: Você tem acesso em tempo real aos dados da empresa — documentos, histórico de interações, tarefas, planos disponíveis. Os dados já foram consultados automaticamente e aparecerão abaixo sob "DADOS CONSULTADOS EM TEMPO REAL". Use esses dados para responder diretamente. NUNCA diga "vou verificar" ou "vou consultar" em tempo futuro — você JÁ TEM os dados disponíveis na sessão. Se os dados consultados estiverem disponíveis abaixo, use-os imediatamente na sua resposta.

REGRAS DE ATENDIMENTO:
- Responda perguntas sobre serviços contábeis, obrigações fiscais, abertura de empresa, simples nacional, MEI, etc.
- Quando perguntarem sobre documentos, histórico ou plano, use os dados reais já consultados.
- Seja cordial, objetivo e use linguagem simples. Evite jargões técnicos desnecessários.
- NUNCA acesse dados de outras empresas — você atende SOMENTE esta empresa.
- Se o usuário quiser falar com outro membro da equipe ou um especialista, use o botão disponível no chat para encaminhar.`

  // RISCO-3: Injeta dados do sócio no systemExtra quando aplicável
  if (isSocio && dadosSocio) {
    const linhasSocio = [
      `CONTEXTO DO SÓCIO (usuário atual):`,
      `- Nome: ${dadosSocio.nome}`,
      dadosSocio.email       ? `- E-mail: ${dadosSocio.email}` : null,
      dadosSocio.qualificacao ? `- Qualificação: ${dadosSocio.qualificacao}` : null,
      dadosSocio.participacao != null ? `- Participação na empresa: ${dadosSocio.participacao}%` : null,
    ].filter(Boolean).join('\n')
    systemExtra += `\n\n${linhasSocio}`
  }

  // FALHA-1/RISCO-2: Injeta escalações abertas deste cliente no contexto da IA
  const escalacoesPendentes = await prisma.escalacao.findMany({
    where: { clienteId: clienteIdParaConversa, status: { in: ['pendente', 'em_atendimento'] } },
    orderBy: { criadoEm: 'desc' },
    take: 3,
    select: { canal: true, motivoIA: true, criadoEm: true, status: true },
  }).catch(() => [])
  if (escalacoesPendentes.length > 0) {
    const linhasEsc = escalacoesPendentes.map(e => {
      const data = e.criadoEm.toLocaleDateString('pt-BR')
      return `- [${e.status}] ${e.canal} em ${data}: ${e.motivoIA ?? 'aguardando atendimento'}`
    })
    systemExtra += `\n\nATENDIMENTO HUMANO PENDENTE:\nEsta empresa tem atendimentos aguardando resposta da equipe:\n${linhasEsc.join('\n')}\nSe o cliente perguntar sobre isso, confirme que a equipe está verificando e responderá em breve.`
  }

  // ── Classificação de intenção + agente (escopo portal — somente leitura) ────
  // Passa a última mensagem da IA como contexto para identificar confirmações de ação
  // Ex: Clara disse "posso verificar seus documentos?" → usuário diz "pode" → deve ser 'acao'
  const ultimaMsgIA = historico.filter(m => m.role === 'assistant').at(-1)?.content
  const contextoClassificacao = ultimaMsgIA
    ? `usuário: ${nomeUsuario}\núltima resposta da assistente: "${typeof ultimaMsgIA === 'string' ? ultimaMsgIA.slice(0, 300) : ''}"`
    : `usuário: ${nomeUsuario}`
  const ultimaMsgIAStr = typeof ultimaMsgIA === 'string' ? ultimaMsgIA : undefined
  const intencao = await classificarIntencao(message, contextoClassificacao, ultimaMsgIAStr)

  if (intencao.tipo === 'acao' && intencao.instrucao) {
    try {
      const resultado = await executarAgente({
        instrucao: intencao.instrucao,
        contexto: {
          clienteId:     clienteIdParaConversa,
          empresaId,
          solicitanteAI: 'portal',
        },
      })

      systemExtra += `\n\n--- DADOS CONSULTADOS EM TEMPO REAL ---
${resultado.resposta}
--- FIM DOS DADOS REAIS ---
Formule sua resposta baseando-se NESSES DADOS REAIS acima. Seja natural e amigável. Não mencione "agente" ou "banco de dados".`
    } catch (err) {
      console.error('[portal/chat] Falha ao executar agente, conversa:', conversaId, err)
      systemExtra += `\n\nAVISO: Houve uma instabilidade ao consultar dados em tempo real. Se o usuário pediu informações específicas, informe que os sistemas estão com lentidão e peça para tentar novamente em instantes.`
      import('@/lib/notificacoes')
        .then(({ notificarAgenteFalhou }) =>
          notificarAgenteFalhou(err instanceof Error ? err.message : String(err))
        )
        .catch((notifErr: unknown) =>
          console.error('[portal/chat] erro ao notificar agente_falhou (agente):', notifErr),
        )
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  let respostaRaw: string
  let provider: string
  let model: string
  try {
    const result = await askAI({
      pergunta:   message,
      context:    { escopo: 'cliente+global', clienteId: clienteIdParaConversa },
      feature:    'portal',
      historico,
      systemExtra,
      maxTokens:  1024,
    })
    respostaRaw = result.resposta
    provider    = result.provider
    model       = result.model
  } catch (aiErr) {
    const aiErrMsg = (aiErr as Error).message ?? String(aiErr)
    console.error('[portal/chat] IA indisponível:', aiErrMsg)
    import('@/lib/notificacoes')
      .then(({ notificarAgenteFalhou }) => notificarAgenteFalhou(aiErrMsg))
      .catch((notifErr: unknown) =>
        console.error('[portal/chat] erro ao notificar agente_falhou (ia):', notifErr),
      )
    return NextResponse.json({ reply: 'Estou com uma instabilidade no momento. Tente novamente em alguns minutos ou acesse a seção de atendimento do portal.' })
  }

  // Detecta escalação automática (##HUMANO## na resposta da IA)
  const escalInfo = detectarEscalacao(respostaRaw)
  const resposta  = escalInfo.escalado ? escalInfo.textoLimpo : respostaRaw

  if (escalInfo.escalado) {
    try {
      // Pausa a conversa imediatamente (aguarda para garantir que a próxima msg seja bloqueada)
      await prisma.conversaIA.update({
        where: { id: conversaId },
        data:  { pausadaEm: new Date() },
      })
      // Cria escalação e notifica em background (não bloqueia a resposta)
      prisma.escalacao.create({
        data: {
          canal:          'portal',
          status:         'pendente',
          clienteId:      clienteIdParaConversa,
          conversaIAId:   conversaId,
          historico:      [...historico, { role: 'user', content: message }] as object[],
          ultimaMensagem: message,
          motivoIA:       escalInfo.motivo ?? 'IA identificou necessidade de atendimento humano.',
        },
      }).then(esc => {
        indexarAsync('escalacao', {
          id:        esc.id,
          clienteId: clienteIdParaConversa,
          canal:     'portal',
          motivoIA:  esc.motivoIA,
          criadoEm:  esc.criadoEm,
        })
        import('@/lib/notificacoes')
          .then(({ notificarEscalacaoPortal }) =>
            notificarEscalacaoPortal(clienteIdParaConversa, esc.id)
          )
          .catch((notifErr: unknown) =>
            console.error('[portal/chat] erro ao notificar escalacao_portal:', { escalacaoId: esc.id, notifErr }),
          )
      }).catch(err => console.error('[portal/chat] Falha ao criar escalação:', err))
    } catch (err) {
      console.error('[portal/chat] Falha ao pausar conversa após escalação:', err)
    }
  }

  addMensagens(conversaId, message, resposta)

  return NextResponse.json({ reply: resposta, provider, model, escalado: escalInfo.escalado, conversaId })
}
