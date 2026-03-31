import { prisma } from '@/lib/prisma'

// Número máximo de mensagens enviadas para a IA como contexto
const MAX_HISTORICO = 20

// WhatsApp: conversa é considerada nova após 24h sem mensagem
const SESSION_TIMEOUT_H = 24
// Conversa pausada reutilizada por no máximo 7 dias — após isso, cria nova sessão
const PAUSED_REUSE_DAYS = 7

// Mensagens mais antigas que 90 dias são removidas do banco
const RETENCAO_DIAS = 90

export type HistoricoMsg = { role: 'user' | 'assistant'; content: string }

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * Retorna o id da conversa ativa para um remoteJid.
 * Cria uma nova conversa se não houver registro ou se a última mensagem
 * tiver mais de SESSION_TIMEOUT_H horas.
 */
export async function getOrCreateConversaWhatsapp(
  remoteJid: string,
  opts?: { clienteId?: string; leadId?: string; socioId?: string },
): Promise<string> {
  const cutoff       = new Date(Date.now() - SESSION_TIMEOUT_H * 3600 * 1000)
  const cutoffPaused = new Date(Date.now() - PAUSED_REUSE_DAYS * 24 * 3600 * 1000)

  const existente = await prisma.conversaIA.findFirst({
    where: {
      canal: 'whatsapp',
      remoteJid,
      // Reutiliza sessão ativa (dentro de 24h) OU pausada (dentro de 7 dias)
      // — limite de 7 dias evita reativar IA para conversas muito antigas
      OR: [
        { atualizadaEm: { gte: cutoff } },
        { pausadaEm: { not: null }, atualizadaEm: { gte: cutoffPaused } },
      ],
    },
    orderBy: { atualizadaEm: 'desc' },
    select: { id: true },
  })

  if (existente) {
    // Atualiza clienteId/leadId se o contato foi identificado nesta mensagem
    if (opts?.clienteId || opts?.leadId || opts?.socioId) {
      prisma.conversaIA.update({
        where: { id: existente.id },
        data: {
          clienteId: opts.clienteId ?? undefined,
          leadId:    opts.leadId    ?? undefined,
          socioId:   opts.socioId   ?? undefined,
        },
      }).catch(() => {})
    }
    return existente.id
  }

  const nova = await prisma.conversaIA.create({
    data: {
      canal:     'whatsapp',
      remoteJid,
      clienteId: opts?.clienteId,
      leadId:    opts?.leadId,
      socioId:   opts?.socioId,
    },
    select: { id: true },
  })

  limparConversasAntigas() // fire-and-forget
  return nova.id
}

// ─── Web (onboarding / portal / crm) ─────────────────────────────────────────

/**
 * Retorna o id da conversa para um sessionId.
 * Cria uma nova conversa se não existir.
 */
export async function getOrCreateConversaSession(
  sessionId: string,
  canal: string,
  opts?: { leadId?: string; clienteId?: string },
): Promise<string> {
  const existente = await prisma.conversaIA.findFirst({
    where: { sessionId, canal },
    select: { id: true },
  })

  if (existente) {
    // Atualiza clienteId/leadId se a sessão foi criada antes da identidade ser resolvida
    if (opts?.clienteId || opts?.leadId) {
      prisma.conversaIA.update({
        where: { id: existente.id },
        data: {
          clienteId: opts.clienteId ?? undefined,
          leadId:    opts.leadId    ?? undefined,
        },
      }).catch(() => {})
    }
    return existente.id
  }

  const nova = await prisma.conversaIA.create({
    data: {
      canal,
      sessionId,
      leadId:    opts?.leadId,
      clienteId: opts?.clienteId,
    },
    select: { id: true },
  })

  limparConversasAntigas() // fire-and-forget
  return nova.id
}

// ─── Atualiza identidade após resolução do contato ───────────────────────────

export function atualizarIdentidadeConversa(
  conversaId: string,
  opts: { clienteId?: string; leadId?: string },
): void {
  prisma.conversaIA.update({
    where: { id: conversaId },
    data: { clienteId: opts.clienteId, leadId: opts.leadId },
  }).catch(() => {})
}

// ─── Mensagens ────────────────────────────────────────────────────────────────

/**
 * Carrega as últimas N mensagens da conversa para enviar à IA como historico.
 */
export async function getHistorico(
  conversaId: string,
  limit = MAX_HISTORICO,
): Promise<HistoricoMsg[]> {
  const rows = await prisma.mensagemIA.findMany({
    where: { conversaId },
    orderBy: { criadaEm: 'asc' },
    select: { role: true, conteudo: true },
  })
  // Mantém apenas as últimas `limit` mensagens
  return rows.slice(-limit).map(r => ({
    role:    r.role as 'user' | 'assistant',
    content: r.conteudo,
  }))
}

/**
 * Persiste a mensagem do usuário quando a IA está pausada.
 * Retorna Promise para que o chamador possa aguardar e detectar falhas.
 * Atualiza também ultimaMensagemEm, usado para identificar "aguardando resposta".
 */
export async function addMensagemUsuario(conversaId: string, conteudo: string): Promise<void> {
  const now = new Date()
  await Promise.all([
    prisma.mensagemIA.create({
      data: { conversaId, role: 'user', conteudo, status: 'sent' },
    }),
    prisma.conversaIA.update({
      where: { id: conversaId },
      data: { atualizadaEm: now, ultimaMensagemEm: now },
    }),
  ])
}

/**
 * Persiste o par user+assistant no banco.
 * A mensagem do assistente é criada com status 'pending' até confirmação de envio.
 * Retorna o id da mensagem do assistente para atualização pós-envio.
 */
export async function addMensagens(
  conversaId: string,
  user: string,
  assistant: string,
): Promise<string> {
  const [, assistantMsg] = await Promise.all([
    prisma.mensagemIA.create({
      data: { conversaId, role: 'user', conteudo: user, status: 'sent' },
    }),
    prisma.mensagemIA.create({
      data: { conversaId, role: 'assistant', conteudo: assistant, status: 'pending' },
      select: { id: true },
    }),
    // @updatedAt só é atualizado por update() — precisa ser explícito
    prisma.conversaIA.update({
      where: { id: conversaId },
      data:  { atualizadaEm: new Date() },
    }),
  ])
  return assistantMsg.id
}

/**
 * Atualiza o status de entrega de uma mensagem do assistente após tentativa de envio.
 */
export async function atualizarStatusMensagem(
  mensagemId: string,
  status: 'sent' | 'failed',
  opts?: { tentativas?: number; erroEnvio?: string },
): Promise<void> {
  await prisma.mensagemIA.update({
    where: { id: mensagemId },
    data: {
      status,
      ...(opts?.tentativas !== undefined && { tentativas: opts.tentativas }),
      erroEnvio: opts?.erroEnvio ?? null,
    },
  }).catch((err) => {
    console.error('[conversa] Falha ao atualizar status da mensagem:', mensagemId, err)
  })
}

// ─── Re-contexto pós-24h (WhatsApp) ──────────────────────────────────────────

/**
 * Retorna as últimas N mensagens da sessão anterior de um número WhatsApp.
 * Usada para re-injetar contexto quando uma nova sessão de 24h é criada.
 */
export async function getHistoricoSessaoAnterior(
  remoteJid: string,
  currentConversaId: string,
  limit = 6,
): Promise<HistoricoMsg[]> {
  const anterior = await prisma.conversaIA.findFirst({
    where: {
      canal:     'whatsapp',
      remoteJid,
      id:        { not: currentConversaId },
    },
    orderBy: { atualizadaEm: 'desc' },
    select:  { id: true },
  })
  if (!anterior) return []
  return getHistorico(anterior.id, limit)
}

// ─── CRM: histórico consolidado de conversas de um cliente/lead ──────────────

/**
 * Retorna as últimas `limit` mensagens de todas as conversas de um cliente
 * (todos os canais), para uso como contexto na IA do CRM.
 */
export async function getHistoricoCliente(
  clienteId: string,
  limit = 40,
): Promise<HistoricoMsg[]> {
  const mensagens = await prisma.mensagemIA.findMany({
    where: { conversa: { clienteId } },
    orderBy: { criadaEm: 'asc' },
    take: limit,
    select: { role: true, conteudo: true, criadaEm: true, conversa: { select: { canal: true } } },
  })
  return mensagens.slice(-limit).map(m => ({
    role:    m.role as 'user' | 'assistant',
    content: `[${m.conversa.canal}] ${m.conteudo}`,
  }))
}

/**
 * Retorna as últimas `limit` mensagens de todas as conversas de um lead.
 */
export async function getHistoricoLead(
  leadId: string,
  limit = 40,
): Promise<HistoricoMsg[]> {
  const mensagens = await prisma.mensagemIA.findMany({
    where: { conversa: { leadId } },
    orderBy: { criadaEm: 'asc' },
    take: limit,
    select: { role: true, conteudo: true, conversa: { select: { canal: true } } },
  })
  return mensagens.slice(-limit).map(m => ({
    role:    m.role as 'user' | 'assistant',
    content: `[${m.conversa.canal}] ${m.conteudo}`,
  }))
}

// ─── Limpeza automática (retenção 90 dias) ───────────────────────────────────

/**
 * Remove conversas cuja última atividade é anterior a RETENCAO_DIAS dias.
 * As mensagens são removidas em cascata pelo banco.
 * Executada em background sempre que uma nova conversa é criada.
 */
function limparConversasAntigas(): void {
  const limite = new Date(Date.now() - RETENCAO_DIAS * 24 * 3600 * 1000)
  prisma.conversaIA.deleteMany({
    where: { atualizadaEm: { lt: limite } },
  }).catch(() => {})
}
