import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { askAI } from '@/lib/ai/ask'
import { getAiConfig } from '@/lib/ai/config'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'
import { classificarIntencao } from '@/lib/ai/classificar-intencao'
import { executarAgente } from '@/lib/ai/agent'
import { rateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
// Garante que todas as tools estejam registradas
import '@/lib/ai/tools'

const MSG_MAX_LENGTH = 2000

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any

  if (!user || user.tipo !== 'cliente') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const clienteId: string = user.id

  const { message, sessionId } = await req.json() as { message: string; sessionId: string }

  if (!message?.trim() || message.length > MSG_MAX_LENGTH) {
    return NextResponse.json({ error: 'message inválido' }, { status: 400 })
  }
  if (!sessionId?.trim()) {
    return NextResponse.json({ error: 'sessionId obrigatório' }, { status: 400 })
  }

  // Rate limit: 30 msgs por hora por cliente
  const rl = rateLimit(`portal-chat:${clienteId}`, 30, 60 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Limite de mensagens atingido. Tente novamente em alguns minutos.' }, { status: 429 })
  }

  const [conversaId, aiConfig, cliente] = await Promise.all([
    getOrCreateConversaSession(sessionId, 'portal', { clienteId }),
    getAiConfig(),
    prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { nome: true, planoTipo: true, valorMensal: true, vencimentoDia: true, regime: true, cidade: true, uf: true },
    }),
  ])

  const historico = await getHistorico(conversaId)
  const nomeCara  = aiConfig.nomeAssistentes.portal ?? 'Clara'

  let systemExtra = `Você é ${nomeCara}, assistente virtual do Portal do Cliente ContabAI. Você atende exclusivamente o cliente ${cliente?.nome ?? user.name}.

DADOS DO CLIENTE:
- Plano: ${cliente?.planoTipo ?? 'não informado'}
- Valor mensalidade: R$ ${cliente?.valorMensal ?? '—'}
- Vencimento dia: ${cliente?.vencimentoDia ?? '—'}
- Regime tributário: ${cliente?.regime ?? 'não informado'}
- Localidade: ${cliente?.cidade ?? ''}${cliente?.uf ? '/' + cliente.uf : ''}

ACESSO A DADOS: Você tem acesso em tempo real aos dados do cliente — documentos, histórico de interações, tarefas, planos disponíveis. Os dados já foram consultados automaticamente e aparecerão abaixo sob "DADOS CONSULTADOS EM TEMPO REAL". Use esses dados para responder diretamente, sem pedir ao cliente para acessar outra seção do portal.

REGRAS:
- Responda perguntas sobre serviços contábeis, obrigações fiscais, abertura de empresa, simples nacional, MEI, etc.
- Quando o cliente pedir documentos, histórico ou informações do plano, use os dados reais já consultados.
- Seja cordial, objetivo e use linguagem simples. Evite jargões técnicos desnecessários.
- NUNCA acesse dados de outros clientes — você atende SOMENTE ${cliente?.nome ?? 'este cliente'}.
- Se o cliente pedir para falar com um humano ou escalar o atendimento, informe que ele pode usar a opção "Solicitar atendimento humano" no chat.`

  // ── Classificação de intenção + agente (escopo portal — somente leitura) ────
  const intencao = await classificarIntencao(message, `cliente: ${cliente?.nome ?? user.name}`)

  if (intencao.tipo === 'acao' && intencao.instrucao) {
    try {
      const resultado = await executarAgente({
        instrucao: intencao.instrucao,
        contexto: {
          clienteId,
          solicitanteAI: 'portal', // restringe às tools do escopo portal (somente leitura)
        },
      })

      systemExtra += `\n\n--- DADOS CONSULTADOS EM TEMPO REAL ---
${resultado.resposta}
--- FIM DOS DADOS REAIS ---
Formule sua resposta baseando-se NESSES DADOS REAIS acima. Seja natural e amigável. Não mencione "agente" ou "banco de dados".`
    } catch (err) {
      // Falha silenciosa para o cliente — notifica admin
      import('@/lib/notificacoes')
        .then(({ notificarAgenteFalhou }) =>
          notificarAgenteFalhou(err instanceof Error ? err.message : String(err))
        )
        .catch(() => {})
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  let resposta: string
  let provider: string
  let model: string
  try {
    const result = await askAI({
      pergunta:   message,
      context:    { escopo: 'cliente+global', clienteId },
      feature:    'portal',
      historico,
      systemExtra,
      maxTokens:  512,
    })
    resposta = result.resposta
    provider = result.provider
    model    = result.model
  } catch (aiErr) {
    const aiErrMsg = (aiErr as Error).message ?? String(aiErr)
    console.error('[portal/chat] IA indisponível:', aiErrMsg)
    import('@/lib/notificacoes')
      .then(({ notificarAgenteFalhou }) => notificarAgenteFalhou(aiErrMsg))
      .catch(() => {})
    return NextResponse.json({ reply: 'Estou com uma instabilidade no momento. Tente novamente em alguns minutos ou acesse a seção de atendimento do portal.' })
  }

  addMensagens(conversaId, message, resposta)

  return NextResponse.json({ reply: resposta, provider, model })
}
