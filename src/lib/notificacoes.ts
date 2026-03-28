/**
 * Helpers para criar notificações no banco de dados.
 *
 * Política de visibilidade por tipo:
 *   ia_offline / agente_falhou / entrega_falhou → somente admin (infra/sistema)
 *   escalacao                                   → admin + contador + assistente (equipe de atendimento)
 */

import { prisma } from '@/lib/prisma'

// Anti-spam: evita criar a mesma notificação múltiplas vezes em curto período
const COOLDOWN_MS = 10 * 60 * 1000 // 10 minutos

// Map<tipo:chave, timestamp da última notificação>
const _cooldowns = new Map<string, number>()

function dentroDoCooldow(chave: string): boolean {
  const ultimo = _cooldowns.get(chave)
  if (!ultimo) return false
  return Date.now() - ultimo < COOLDOWN_MS
}

function registrarCooldown(chave: string) {
  _cooldowns.set(chave, Date.now())
  // Limpa entradas expiradas para não vazar memória
  for (const [k, ts] of _cooldowns) {
    if (Date.now() - ts > COOLDOWN_MS * 2) _cooldowns.delete(k)
  }
}

/** Somente admins — para notificações de infra/sistema */
async function buscarAdmins(): Promise<string[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { ativo: true, tipo: 'admin' },
    select: { id: true },
  })
  return usuarios.map(u => u.id)
}

/** Toda a equipe de atendimento — para notificações de escalação */
async function buscarEquipeAtendimento(): Promise<string[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { ativo: true, tipo: { in: ['admin', 'contador', 'assistente'] } },
    select: { id: true },
  })
  return usuarios.map(u => u.id)
}

async function criarParaTodos(
  usuarioIds: string[],
  dados: { tipo: string; titulo: string; mensagem?: string; url?: string },
) {
  if (usuarioIds.length === 0) return
  await prisma.notificacao.createMany({
    data: usuarioIds.map(usuarioId => ({
      usuarioId,
      tipo:     dados.tipo,
      titulo:   dados.titulo,
      mensagem: dados.mensagem,
      url:      dados.url,
      lida:     false,
    })),
    skipDuplicates: true,
  })
}

// ─── Notificações específicas ──────────────────────────────────────────────────

/**
 * Notifica quando um provider de IA vai offline.
 * Anti-spam: no máximo uma notificação por provider a cada 10 minutos.
 */
export async function notificarIaOffline(provider: string, erro: string): Promise<void> {
  const chave = `ia_offline:${provider}`
  if (dentroDoCooldow(chave)) return
  registrarCooldown(chave)

  try {
    const PROVIDER_LABELS: Record<string, string> = {
      claude:  'Claude (Anthropic)',
      openai:  'OpenAI',
      google:  'Google Gemini',
      groq:    'Groq',
      voyage:  'Voyage AI (RAG)',
    }

    const ids = await buscarAdmins()
    await criarParaTodos(ids, {
      tipo:    'ia_offline',
      titulo:  `Provider offline: ${PROVIDER_LABELS[provider] ?? provider}`,
      mensagem: erro.slice(0, 200),
      url:     '/crm/configuracoes/ia/saude',
    })
  } catch (err) {
    console.error('[notificacoes] falha ao criar notificação ia_offline:', err)
  }
}

/**
 * Notifica quando o agente operacional falha completamente (todos os providers esgotados).
 * Anti-spam: no máximo uma notificação a cada 10 minutos.
 */
export async function notificarAgenteFalhou(erro: string): Promise<void> {
  const chave = 'agente_falhou'
  if (dentroDoCooldow(chave)) return
  registrarCooldown(chave)

  try {
    const ids = await buscarAdmins()
    await criarParaTodos(ids, {
      tipo:    'agente_falhou',
      titulo:  'Agente operacional indisponível',
      mensagem: `Todos os providers falharam. ${erro.slice(0, 150)}`,
      url:     '/crm/configuracoes/ia/saude',
    })
  } catch (err) {
    console.error('[notificacoes] falha ao criar notificação agente_falhou:', err)
  }
}

/**
 * Notifica a equipe quando o cliente responde a uma conversa que está com IA pausada
 * (humano no controle) — o operador precisa saber para não deixar o cliente esperando.
 * Anti-spam: no máximo uma notificação por conversa a cada 10 minutos.
 */
export async function notificarRespostaClientePausado(opts: {
  conversaId: string
  clienteId?: string | null
  leadId?: string | null
  remoteJid?: string | null
}): Promise<void> {
  const chave = `resposta_pausado:${opts.conversaId}`
  if (dentroDoCooldow(chave)) return
  registrarCooldown(chave)

  try {
    let nome = opts.remoteJid?.replace('@s.whatsapp.net', '') ?? 'Contato'
    if (opts.clienteId) {
      const c = await prisma.cliente.findUnique({
        where:  { id: opts.clienteId },
        select: { nome: true, empresa: { select: { razaoSocial: true } } },
      })
      nome = c?.empresa?.razaoSocial ?? c?.nome ?? nome
    } else if (opts.leadId) {
      const l = await prisma.lead.findUnique({
        where:  { id: opts.leadId },
        select: { dadosJson: true, contatoEntrada: true },
      })
      const dados = (l?.dadosJson ?? {}) as Record<string, string>
      nome = dados['Nome completo'] ?? dados['Razão Social'] ?? l?.contatoEntrada ?? nome
    }

    const ids = await buscarEquipeAtendimento()
    await criarParaTodos(ids, {
      tipo:    'resposta_cliente',
      titulo:  `${nome} respondeu`,
      mensagem: 'Mensagem recebida enquanto IA está pausada. Aguarda sua resposta.',
      url:     `/crm/atendimentos/conversa/${opts.conversaId}`,
    })
  } catch (err) {
    console.error('[notificacoes] falha ao notificar resposta_cliente_pausado:', err)
  }
}

/**
 * Notifica a equipe quando uma OS é resolvida — o cliente não é notificado por push,
 * mas a equipe precisa confirmar que a resposta chegou ao cliente pelo canal correto.
 */
export async function notificarOSResolvida(opts: {
  osId: string
  clienteId?: string | null
  titulo: string
}): Promise<void> {
  try {
    const nome = opts.clienteId
      ? (await prisma.cliente.findUnique({ where: { id: opts.clienteId }, select: { nome: true } }))?.nome ?? 'Cliente'
      : 'Cliente'
    const ids = await buscarEquipeAtendimento()
    await criarParaTodos(ids, {
      tipo:    'os_resolvida',
      titulo:  `OS resolvida: ${opts.titulo.slice(0, 60)}`,
      mensagem: `${nome} pode verificar a resposta no portal.`,
      url:     `/crm/ordens-servico/${opts.osId}`,
    })
  } catch (err) {
    console.error('[notificacoes] falha ao notificar os_resolvida:', err)
  }
}

/**
 * Notifica a equipe quando um cliente envia um documento pelo portal.
 */
export async function notificarDocumentoEnviado(opts: {
  clienteId: string
  nomeArquivo: string
}): Promise<void> {
  const chave = `doc_enviado:${opts.clienteId}`
  if (dentroDoCooldow(chave)) return
  registrarCooldown(chave)

  try {
    const cliente = await prisma.cliente.findUnique({
      where:  { id: opts.clienteId },
      select: { nome: true },
    })
    const ids = await buscarEquipeAtendimento()
    await criarParaTodos(ids, {
      tipo:    'documento_enviado',
      titulo:  `Documento recebido de ${cliente?.nome ?? 'Cliente'}`,
      mensagem: opts.nomeArquivo.slice(0, 100),
      url:     `/crm/clientes/${opts.clienteId}`,
    })
  } catch (err) {
    console.error('[notificacoes] falha ao notificar documento_enviado:', err)
  }
}

/**
 * Notifica quando um cliente solicita atendimento humano pelo portal.
 */
export async function notificarEscalacaoPortal(clienteId: string, escalacaoId: string): Promise<void> {
  try {
    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { nome: true },
    })
    const ids = await buscarEquipeAtendimento()
    await criarParaTodos(ids, {
      tipo:    'escalacao',
      titulo:  `Atendimento solicitado pelo portal`,
      mensagem: `${cliente?.nome ?? 'Cliente'} solicitou atendimento humano.`,
      url:     `/crm/atendimentos`,
    })
  } catch (err) {
    console.error('[notificacoes] falha ao criar notificação escalacao_portal:', err)
  }
}

/**
 * Notifica quando um email é recebido na caixa do escritório.
 * Anti-spam: no máximo uma notificação a cada 5 minutos (emails chegam em batch).
 */
export async function notificarEmailRecebido({
  de,
  assunto,
  interacaoId,
}: {
  de: string
  assunto: string
  interacaoId: string
}): Promise<void> {
  const chave = `email_recebido:${de.toLowerCase()}`
  if (dentroDoCooldow(chave)) return
  registrarCooldown(chave)

  try {
    const ids = await buscarEquipeAtendimento()
    await criarParaTodos(ids, {
      tipo:    'email_recebido',
      titulo:  `E-mail recebido: ${assunto.slice(0, 60)}`,
      mensagem: `De: ${de}`,
      url:     `/crm/emails`,
    })
  } catch (err) {
    console.error('[notificacoes] falha ao criar notificação email_recebido:', err)
  }
}
