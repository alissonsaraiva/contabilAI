import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { askAI, SYSTEM_NFSE_INSTRUCOES_CRM } from '@/lib/ai/ask'
import { getAiConfig } from '@/lib/ai/config'
import { getOrCreateConversaSession, getHistorico, addMensagens } from '@/lib/ai/conversa'
import { rateLimit } from '@/lib/rate-limit'
import { classificarIntencao } from '@/lib/ai/classificar-intencao'
import { executarAgente } from '@/lib/ai/agent'
// Garante que todas as tools estejam registradas
import '@/lib/ai/tools'

const MSG_MAX_LENGTH = 4000

function mascararCpf(cpf: string): string {
  return cpf.replace(/^(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})$/, '***.***.***-$4')
}

function mascararCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})\.?(\d{3})\.?(\d{3})\/?(\d{4})-?(\d{2})$/, '**.***.***/****-$5')
}

function sanitizarDadosExternos(texto: string): string {
  return texto
    .replace(/##[A-Z_]+##/g, '')
    .replace(/\b(ignore|forget|disregard|system|instruction)\b/gi, '[FILTRADO]')
    .slice(0, 3000)
}

// GET — carrega histórico de uma sessão existente para restaurar o chat na UI
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ mensagens: [] })

  const conversa = await prisma.conversaIA.findFirst({
    where:   { sessionId, canal: 'crm' },
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

  const [conversaId, aiConfig, escritorioCRM] = await Promise.all([
    getOrCreateConversaSession(sessionId, 'crm', { clienteId, leadId }),
    getAiConfig(),
    prisma.escritorio.findFirst({ select: { spedyApiKey: true } }),
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
  let dadosContextoExtra = ''

  if (clienteId) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        nome: true,
        email: true,
        telefone: true,
        whatsapp: true,
        cpf: true,
        planoTipo: true,
        valorMensal: true,
        vencimentoDia: true,
        formaPagamento: true,
        status: true,
        cidade: true,
        uf: true,
        tipoContribuinte: true,
        empresa: { select: { razaoSocial: true, cnpj: true, regime: true, nomeFantasia: true } },
        responsavel: { select: { nome: true } },
      },
    })
    const nome = cliente?.empresa?.razaoSocial ?? cliente?.nome
    escopoLabel = nome ? `cliente: ${nome}` : 'cliente (dados não encontrados)'
    if (cliente) {
      const linhas: string[] = []
      if (cliente.nome)              linhas.push(`Nome: ${cliente.nome}`)
      if (cliente.email)             linhas.push(`E-mail: ${cliente.email}`)
      if (cliente.telefone)          linhas.push(`Telefone: ${cliente.telefone}`)
      if (cliente.whatsapp)          linhas.push(`WhatsApp: ${cliente.whatsapp}`)
      if (cliente.cpf)               linhas.push(`CPF: ${mascararCpf(cliente.cpf)}`)
      if (cliente.empresa?.cnpj)     linhas.push(`CNPJ: ${mascararCnpj(cliente.empresa.cnpj)}`)
      if (cliente.empresa?.razaoSocial) linhas.push(`Razão Social: ${cliente.empresa.razaoSocial}`)
      if (cliente.empresa?.nomeFantasia) linhas.push(`Nome Fantasia: ${cliente.empresa.nomeFantasia}`)
      if (cliente.empresa?.regime)   linhas.push(`Regime: ${cliente.empresa.regime}`)
      if (cliente.planoTipo)         linhas.push(`Plano: ${cliente.planoTipo}`)
      if (cliente.valorMensal)       linhas.push(`Valor mensal: R$ ${cliente.valorMensal}`)
      if (cliente.vencimentoDia)     linhas.push(`Vencimento: dia ${cliente.vencimentoDia}`)
      if (cliente.formaPagamento)    linhas.push(`Forma de pagamento: ${cliente.formaPagamento}`)
      if (cliente.cidade || cliente.uf) linhas.push(`Cidade: ${[cliente.cidade, cliente.uf].filter(Boolean).join('/')}`)
      if (cliente.tipoContribuinte)  linhas.push(`Tipo: ${cliente.tipoContribuinte}`)
      if (cliente.status)            linhas.push(`Status: ${cliente.status}`)
      if (cliente.responsavel?.nome) linhas.push(`Responsável: ${cliente.responsavel.nome}`)
      if (linhas.length > 0) {
        dadosContextoExtra = `\n\nDADOS DO CLIENTE:\n${linhas.join('\n')}`
      }
    }
  } else if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        contatoEntrada: true,
        dadosJson: true,
        planoTipo: true,
        valorNegociado: true,
        vencimentoDia: true,
        formaPagamento: true,
        status: true,
        observacoes: true,
        responsavel: { select: { nome: true } },
      },
    })
    const dados = (lead?.dadosJson ?? {}) as Record<string, string>
    const nome = dados['Nome completo'] ?? dados['Razão Social'] ?? lead?.contatoEntrada
    escopoLabel = nome ? `lead: ${nome}` : 'lead (sem dados completos ainda)'
    if (lead) {
      const linhas: string[] = []
      // Injeta todos os campos do dadosJson (formulário de onboarding)
      for (const [k, v] of Object.entries(dados)) {
        if (v) linhas.push(`${k}: ${v}`)
      }
      if (lead.planoTipo)      linhas.push(`Plano de interesse: ${lead.planoTipo}`)
      if (lead.valorNegociado) linhas.push(`Valor negociado: R$ ${lead.valorNegociado}`)
      if (lead.vencimentoDia)  linhas.push(`Vencimento: dia ${lead.vencimentoDia}`)
      if (lead.formaPagamento) linhas.push(`Forma de pagamento: ${lead.formaPagamento}`)
      if (lead.status)         linhas.push(`Status: ${lead.status}`)
      if (lead.observacoes)    linhas.push(`Observações: ${lead.observacoes}`)
      if (lead.responsavel?.nome) linhas.push(`Responsável: ${lead.responsavel.nome}`)
      if (linhas.length > 0) {
        dadosContextoExtra = `\n\nDADOS DO LEAD:\n${linhas.join('\n')}`
      }
    }
  }

  let systemExtra = `CONTEXTO DE USO: Você está sendo consultado por um membro interno da equipe contábil (contador ou admin) via painel CRM. Responda de forma técnica e detalhada. O usuário tem acesso completo à base de clientes do escritório.

FOCO ATUAL: ${escopoLabel}. Priorize informações deste contexto, mas pode consultar e comparar com outros clientes quando isso for útil para a análise.

ACESSO A DADOS: Você possui acesso em tempo real a TODOS os dados do CRM — clientes, leads, tarefas, funil, prospecção, métricas, histórico, contratos, interações. Os dados já foram consultados automaticamente antes desta resposta e aparecerão abaixo sob "DADOS CONSULTADOS EM TEMPO REAL".
REGRAS OBRIGATÓRIAS:
- NUNCA peça ao usuário dados que existem no CRM — busque-os você mesmo
- NUNCA diga que não tem acesso ao banco de dados ou ao sistema
- Se os dados não aparecerem abaixo, significa que o sistema não encontrou resultados — informe isso claramente, mas não peça ao usuário para fornecer a informação manualmente
- Se a pergunta exigir dados que ainda não foram buscados, informe que pode buscá-los e peça confirmação — mas nunca transfira a responsabilidade de busca para o usuário`

  if (dadosContextoExtra) systemExtra += sanitizarDadosExternos(dadosContextoExtra)

  // NFS-e: injeta instruções de emissão para operadores quando o escritório tem Spedy configurado
  if (escritorioCRM?.spedyApiKey) {
    systemExtra += `\n\n${SYSTEM_NFSE_INSTRUCOES_CRM}`
  }

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

    const sessenta_dias_atras = new Date(Date.now() - 60 * 24 * 60 * 60_000)
    const mensagensCanais = await prisma.mensagemIA.findMany({
      where: {
        conversa: { OR: orConditions },
        criadaEm: { gte: sessenta_dias_atras },
      },
      orderBy: { criadaEm: 'asc' },
      take: 100,
      select: { role: true, conteudo: true, criadaEm: true, conversa: { select: { canal: true } } },
    })

    if (mensagensCanais.length > 0) {
      const agora = Date.now()
      const linhas = mensagensCanais.map((m: { role: string; conteudo: string; criadaEm: Date; conversa: { canal: string } }) => {
        const autor = m.role === 'user' ? 'Cliente' : (aiConfig.nomeAssistentes.crm ?? 'Assistente')
        const diffMs = agora - m.criadaEm.getTime()
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const tempo = diffDias === 0 ? 'hoje' : diffDias === 1 ? 'ontem' : `há ${diffDias}d`
        return `${autor} (${m.conversa.canal}, ${tempo}): ${m.conteudo}`
      })
      systemExtra += `\n\nHISTÓRICO DE CONVERSAS DO CLIENTE (todos os canais — últimos 60 dias):\n${linhas.join('\n')}`
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

      // Injeta sempre — mesmo que nenhuma tool tenha sido chamada o agente pode ter uma resposta útil
      systemExtra += `\n\n--- DADOS CONSULTADOS EM TEMPO REAL ---
${resultado.resposta}
--- FIM DOS DADOS REAIS ---
Formule sua resposta baseando-se NESSES DADOS REAIS acima. Seja natural, conversacional e objetivo. Não mencione que consultou um "agente" ou "banco de dados" — apenas apresente as informações como se fossem seu conhecimento atual.`
    } catch (err) {
      // Agente falhou — notifica o admin via central de notificações, não o operador no chat
      Sentry.captureException(err, { tags: { module: 'crm-chat', operation: 'agent' }, extra: { clienteId, leadId } })
      const { notificarAgenteFalhou } = await import('@/lib/notificacoes')
      notificarAgenteFalhou(err instanceof Error ? err.message : String(err)).catch((notifErr: unknown) =>
        console.error('[crm/ai/chat] erro ao notificar agente_falhou (agente):', notifErr),
      )
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
    Sentry.captureException(aiErr, { tags: { module: 'crm-chat', operation: 'askAI' }, extra: { clienteId, leadId } })
    import('@/lib/notificacoes')
      .then(({ notificarAgenteFalhou }) => notificarAgenteFalhou(aiErrMsg))
      .catch((notifErr: unknown) =>
        console.error('[crm/ai/chat] erro ao notificar agente_falhou (ia):', notifErr),
      )
    return NextResponse.json({ reply: 'Estou enfrentando uma instabilidade no momento. Tente novamente em alguns instantes.' })
  }

  addMensagens(conversaId, message, resposta)

  return NextResponse.json({ reply: resposta, provider, model })
}
