import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { askAI, detectarEscalacao } from '@/lib/ai/ask'
import { getAiConfig } from '@/lib/ai/config'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'
import { classificarIntencao } from '@/lib/ai/classificar-intencao'
import { executarAgente } from '@/lib/ai/agent'
import { rateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
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
      mensagens: {
        orderBy: { criadaEm: 'asc' },
        select:  { role: true, conteudo: true },
      },
    },
  })

  return NextResponse.json({ mensagens: conversa?.mensagens ?? [] })
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

  // Busca dados do titular da empresa para contexto da IA
  const clienteTitular = await prisma.cliente.findUnique({
    where:  { empresaId },
    select: { id: true, nome: true, planoTipo: true, valorMensal: true, vencimentoDia: true, cidade: true, uf: true, empresa: { select: { regime: true } } },
  })

  // Para sócios, vincula conversa ao clienteId do titular; titulares usam o próprio id.
  // Se sócio sem empresa encontrada, bloqueia para evitar contexto de cliente indefinido.
  if (isSocio && !clienteTitular) {
    return NextResponse.json({ error: 'Empresa não encontrada para este sócio.' }, { status: 403 })
  }
  const clienteIdParaConversa = isSocio ? clienteTitular!.id : sessionUserId

  const [conversaId, aiConfig, escritorio] = await Promise.all([
    getOrCreateConversaSession(sessionId, 'portal', { clienteId: clienteIdParaConversa }),
    getAiConfig(),
    prisma.escritorio.findFirst({ select: { nome: true } }),
  ])

  const historico = await getHistorico(conversaId)
  const nomeCara       = aiConfig.nomeAssistentes.portal ?? 'Clara'
  const nomeEscritorio = escritorio?.nome ?? process.env.NEXT_PUBLIC_APP_NAME ?? 'ContabAI'
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

ACESSO A DADOS: Você tem acesso em tempo real aos dados da empresa — documentos, histórico de interações, tarefas, planos disponíveis. Os dados já foram consultados automaticamente e aparecerão abaixo sob "DADOS CONSULTADOS EM TEMPO REAL". Use esses dados para responder diretamente.

REGRAS DE ATENDIMENTO:
- Responda perguntas sobre serviços contábeis, obrigações fiscais, abertura de empresa, simples nacional, MEI, etc.
- Quando perguntarem sobre documentos, histórico ou plano, use os dados reais já consultados.
- Seja cordial, objetivo e use linguagem simples. Evite jargões técnicos desnecessários.
- NUNCA acesse dados de outras empresas — você atende SOMENTE esta empresa.
- Se o usuário quiser falar com outro membro da equipe ou um especialista, use o botão disponível no chat para encaminhar.`

  // ── Classificação de intenção + agente (escopo portal — somente leitura) ────
  const intencao = await classificarIntencao(message, `usuário: ${nomeUsuario}`)

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
      import('@/lib/notificacoes')
        .then(({ notificarAgenteFalhou }) =>
          notificarAgenteFalhou(err instanceof Error ? err.message : String(err))
        )
        .catch(() => {})
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
      maxTokens:  512,
    })
    respostaRaw = result.resposta
    provider    = result.provider
    model       = result.model
  } catch (aiErr) {
    const aiErrMsg = (aiErr as Error).message ?? String(aiErr)
    console.error('[portal/chat] IA indisponível:', aiErrMsg)
    import('@/lib/notificacoes')
      .then(({ notificarAgenteFalhou }) => notificarAgenteFalhou(aiErrMsg))
      .catch(() => {})
    return NextResponse.json({ reply: 'Estou com uma instabilidade no momento. Tente novamente em alguns minutos ou acesse a seção de atendimento do portal.' })
  }

  // Detecta escalação automática (##HUMANO## na resposta da IA)
  const escalInfo = detectarEscalacao(respostaRaw)
  const resposta  = escalInfo.escalado ? escalInfo.textoLimpo : respostaRaw

  if (escalInfo.escalado) {
    // Cria escalação e pausa a conversa (fire-and-forget em paralelo)
    Promise.all([
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
        import('@/lib/notificacoes')
          .then(({ notificarEscalacaoPortal }) =>
            notificarEscalacaoPortal(clienteIdParaConversa, esc.id)
          )
          .catch(() => {})
      }),
      prisma.conversaIA.update({
        where: { id: conversaId },
        data:  { pausadaEm: new Date() },
      }),
    ]).catch(() => {})
  }

  addMensagens(conversaId, message, resposta)

  return NextResponse.json({ reply: resposta, provider, model, escalado: escalInfo.escalado })
}
