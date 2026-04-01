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
    const { PROVIDER_LABELS } = await import('@/lib/ai/constants')

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
 * Notifica a equipe quando um cliente entra em inadimplência via Asaas.
 * Anti-spam: no máximo uma notificação por cliente a cada 10 minutos.
 */
export async function notificarClienteInadimplente(opts: {
  clienteId: string
  nomeCliente: string
  valorVencido: number
  vencimento: Date
}): Promise<void> {
  const chave = `inadimplente:${opts.clienteId}`
  if (dentroDoCooldow(chave)) return
  registrarCooldown(chave)

  try {
    const valor = opts.valorVencido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const data  = opts.vencimento.toLocaleDateString('pt-BR')
    const ids = await buscarEquipeAtendimento()
    await criarParaTodos(ids, {
      tipo:    'cliente_inadimplente',
      titulo:  `Inadimplência: ${opts.nomeCliente}`,
      mensagem: `Boleto de ${valor} venceu em ${data}.`,
      url:     `/crm/clientes/${opts.clienteId}`,
    })
  } catch (err) {
    console.error('[notificacoes] falha ao notificar cliente_inadimplente:', err)
  }
}


/**
 * Notifica a equipe quando o processamento IA de um documento falha definitivamente
 * (todas as tentativas esgotadas). Abre um chamado (OS) se houver clienteId.
 */
export async function notificarDocumentoFalhou(opts: {
  documentoId:   string
  clienteId?:    string
  leadId?:       string
  nomeArquivo:   string
  tipoDocumento: string
  erro:          string
}): Promise<void> {
  const chave = `doc_falhou:${opts.documentoId}`
  if (dentroDoCooldow(chave)) return
  registrarCooldown(chave)

  try {
    let nomeCliente = 'Cliente desconhecido'
    if (opts.clienteId) {
      const c = await prisma.cliente.findUnique({
        where:  { id: opts.clienteId },
        select: { nome: true },
      })
      nomeCliente = c?.nome ?? nomeCliente
    } else if (opts.leadId) {
      const l = await prisma.lead.findUnique({
        where:  { id: opts.leadId },
        select: { dadosJson: true, contatoEntrada: true },
      })
      const dados = (l?.dadosJson ?? {}) as Record<string, string>
      nomeCliente = dados['Nome completo'] ?? dados['Razão Social'] ?? l?.contatoEntrada ?? nomeCliente
    }

    // Notifica o sino
    const ids = await buscarEquipeAtendimento()
    await criarParaTodos(ids, {
      tipo:    'documento_falhou',
      titulo:  `Falha ao processar documento de ${nomeCliente}`,
      mensagem: `Arquivo "${opts.nomeArquivo}" não pôde ser processado após 3 tentativas. Revisão manual necessária.`,
      url:     opts.clienteId
        ? `/crm/clientes/${opts.clienteId}`
        : opts.leadId
        ? `/crm/leads/${opts.leadId}`
        : '/crm/atendimentos',
    })

    // Abre OS se houver cliente vinculado
    if (opts.clienteId) {
      await prisma.ordemServico.create({
        data: {
          clienteId:  opts.clienteId,
          tipo:       'documento',
          origem:     'ia',
          visivelPortal: false,
          titulo:     `Documento não processado: ${opts.nomeArquivo.slice(0, 60)}`,
          descricao:  `O sistema tentou processar o documento "${opts.nomeArquivo}" (${opts.tipoDocumento}) 3 vezes e não conseguiu gerar o resumo/classificação automática.\n\nErro: ${opts.erro.slice(0, 300)}\n\nDocumento ID: ${opts.documentoId}\n\nAção necessária: revisar manualmente o documento e confirmar se deve ser arquivado.`,
          status:     'aberta',
          prioridade: 'media',
        },
      }).catch((err: unknown) =>
        console.error('[notificacoes] erro ao criar OS para documento_falhou:', {
          documentoId: opts.documentoId,
          clienteId:   opts.clienteId,
          err,
        }),
      ) // OS é best-effort — não deve travar a notificação
    }
  } catch (err) {
    console.error('[notificacoes] falha ao notificar documento_falhou:', err)
  }
}
