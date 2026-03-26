import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { askAI } from '@/lib/ai/ask'
import { getAiConfig } from '@/lib/ai/config'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'
import { rateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'

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

  const systemExtra = `Você é ${nomeCara}, assistente virtual do Portal do Cliente ContabAI. Você atende exclusivamente o cliente ${cliente?.nome ?? user.name}.

DADOS DO CLIENTE:
- Plano: ${cliente?.planoTipo ?? 'não informado'}
- Valor mensalidade: R$ ${cliente?.valorMensal ?? '—'}
- Vencimento dia: ${cliente?.vencimentoDia ?? '—'}
- Regime tributário: ${cliente?.regime ?? 'não informado'}
- Localidade: ${cliente?.cidade ?? ''}${cliente?.uf ? '/' + cliente.uf : ''}

REGRAS:
- Responda perguntas sobre serviços contábeis, obrigações fiscais, abertura de empresa, simples nacional, MEI, etc.
- Para assuntos específicos do escritório (documentos, pagamentos, contratos), oriente o cliente a acessar as seções do portal ou a entrar em contato com o escritório.
- Seja cordial, objetivo e use linguagem simples. Evite jargões técnicos desnecessários.
- NUNCA acesse dados de outros clientes ou dados que não sejam os do ${cliente?.nome ?? 'cliente'}.
- Se o cliente pedir para falar com um humano ou escalar o atendimento, informe que ele pode usar a opção "Solicitar atendimento humano" no chat.`

  const { resposta, provider, model } = await askAI({
    pergunta:   message,
    context:    { escopo: 'cliente+global', clienteId },
    feature:    'portal',
    historico,
    systemExtra,
    maxTokens:  512,
  })

  addMensagens(conversaId, message, resposta)

  return NextResponse.json({ reply: resposta, provider, model })
}
