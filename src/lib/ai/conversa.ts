import { prisma } from '@/lib/prisma'

// Número máximo de mensagens enviadas para a IA como contexto
const MAX_HISTORICO = 20

// WhatsApp: conversa é considerada nova após 24h sem mensagem
const SESSION_TIMEOUT_H = 24

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
  opts?: { clienteId?: string; leadId?: string },
): Promise<string> {
  const cutoff = new Date(Date.now() - SESSION_TIMEOUT_H * 3600 * 1000)

  const existente = await prisma.conversaIA.findFirst({
    where: { canal: 'whatsapp', remoteJid, atualizadaEm: { gte: cutoff } },
    orderBy: { atualizadaEm: 'desc' },
    select: { id: true },
  })

  if (existente) {
    // Atualiza clienteId/leadId se o contato foi identificado nesta mensagem
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
      canal:     'whatsapp',
      remoteJid,
      clienteId: opts?.clienteId,
      leadId:    opts?.leadId,
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

  if (existente) return existente.id

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
 * Persiste o par user+assistant no banco. Fire-and-forget.
 * Também atualiza atualizadaEm da conversa (necessário para o timeout de 24h).
 */
export function addMensagens(
  conversaId: string,
  user: string,
  assistant: string,
): void {
  Promise.all([
    prisma.mensagemIA.createMany({
      data: [
        { conversaId, role: 'user',      conteudo: user },
        { conversaId, role: 'assistant', conteudo: assistant },
      ],
    }),
    // @updatedAt só é atualizado por update() — precisa ser explícito
    prisma.conversaIA.update({
      where: { id: conversaId },
      data:  { atualizadaEm: new Date() },
    }),
  ]).catch(() => {})
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
