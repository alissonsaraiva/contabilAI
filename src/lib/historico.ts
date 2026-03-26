/**
 * Sistema central de histórico de atividades (activity log).
 *
 * Todas as escritas são fire-and-forget — nunca bloqueiam o caminho crítico.
 *
 * ## Adicionar novo tipo de evento (sem migration):
 * 1. Adicione a string ao union TipoEvento
 * 2. Adicione entrada em EVENTO_CONFIG com icon e label
 * 3. Crie uma função registrar<SuaFeature>() exportada
 * 4. Chame-a onde necessário — uma linha, sem .catch()
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

// ─── Catálogo de tipos de evento ──────────────────────────────────────────────

export type TipoEvento =
  // Interações manuais
  | 'whatsapp_enviado'
  | 'email_enviado'
  | 'email_recebido'
  | 'ligacao'
  | 'nota_interna'
  | 'status_mudou'
  | 'contrato_gerado'
  | 'contrato_assinado'
  | 'documento_enviado'
  | 'tarefa_criada'
  | 'tarefa_concluida'
  | 'cliente_ativado'
  // Atendimentos / escalações
  | 'ia_escalada'
  | 'humano_assumiu'
  | 'humano_respondeu'
  | 'ia_retomada'
  | 'escalacao_resolvida'
  // Agente operacional
  | 'agente_executou'
  | 'agente_falhou'
  // Mudanças de entidade
  | 'lead_status_mudou'
  | 'cliente_status_mudou'
  | 'cliente_criado'
  // Extensível — novas features adicionam aqui
  | (string & {})

// ─── Config de ícone/label por tipo ───────────────────────────────────────────

export const EVENTO_CONFIG: Record<string, { icon: string; label: string; cor?: string }> = {
  whatsapp_enviado:    { icon: 'chat',              label: 'WhatsApp enviado' },
  email_enviado:       { icon: 'mail',              label: 'E-mail enviado' },
  email_recebido:      { icon: 'mark_email_unread', label: 'E-mail recebido' },
  ligacao:             { icon: 'call',              label: 'Ligação' },
  nota_interna:        { icon: 'sticky_note_2',     label: 'Nota interna' },
  status_mudou:        { icon: 'swap_horiz',        label: 'Status alterado' },
  contrato_gerado:     { icon: 'description',       label: 'Contrato gerado' },
  contrato_assinado:   { icon: 'verified',          label: 'Contrato assinado' },
  documento_enviado:   { icon: 'upload_file',       label: 'Documento enviado' },
  tarefa_criada:       { icon: 'task_alt',          label: 'Tarefa criada' },
  tarefa_concluida:    { icon: 'check_circle',      label: 'Tarefa concluída',         cor: 'text-green-status' },
  cliente_ativado:     { icon: 'person_check',      label: 'Cliente ativado',          cor: 'text-green-status' },
  ia_escalada:         { icon: 'support_agent',     label: 'Escalado para humano',     cor: 'text-orange-status' },
  humano_assumiu:      { icon: 'manage_accounts',   label: 'Atendimento assumido' },
  humano_respondeu:    { icon: 'manage_accounts',   label: 'Respondido por operador' },
  ia_retomada:         { icon: 'smart_toy',         label: 'Devolvido para IA' },
  escalacao_resolvida: { icon: 'check_circle',      label: 'Atendimento resolvido',    cor: 'text-green-status' },
  agente_executou:     { icon: 'build',             label: 'Ação do agente' },
  agente_falhou:       { icon: 'error',             label: 'Falha do agente',          cor: 'text-error' },
  lead_status_mudou:   { icon: 'swap_horiz',        label: 'Status do lead alterado' },
  cliente_status_mudou:{ icon: 'swap_horiz',        label: 'Status do cliente alterado' },
  cliente_criado:      { icon: 'person_add',        label: 'Cliente criado',           cor: 'text-green-status' },
}

export function getEventoConfig(tipo: string) {
  return EVENTO_CONFIG[tipo] ?? { icon: 'circle', label: tipo }
}

// ─── Payload interno ──────────────────────────────────────────────────────────

type RegistrarParams = {
  tipo: TipoEvento
  origem: 'usuario' | 'ia' | 'agente' | 'sistema'
  clienteId?: string
  leadId?: string
  usuarioId?: string
  titulo?: string
  conteudo?: string
  metadados?: Record<string, unknown>
  escritorioEvento?: boolean
}

// Escrita interna — fire-and-forget via .catch()
function registrar(params: RegistrarParams): void {
  prisma.interacao
    .create({
      data: {
        tipo:             params.tipo,
        origem:           params.origem,
        escritorioEvento: params.escritorioEvento ?? false,
        clienteId:        params.clienteId,
        leadId:           params.leadId,
        usuarioId:        params.usuarioId,
        titulo:           params.titulo,
        conteudo:         params.conteudo,
        metadados:        params.metadados as Prisma.InputJsonValue ?? undefined,
      } as Prisma.InteracaoUncheckedCreateInput,
    })
    .catch(err => console.error('[historico] falha ao registrar evento:', params.tipo, err))
}

// ─── API pública por domínio ──────────────────────────────────────────────────

// ── Atendimentos ──────────────────────────────────────────────────────────────

export function registrarHumanoAssumiu(params: {
  conversaId: string
  operadorId: string
  operadorNome: string
  clienteId?: string
  leadId?: string
}): void {
  registrar({
    tipo: 'humano_assumiu',
    origem: 'usuario',
    clienteId: params.clienteId,
    leadId: params.leadId,
    usuarioId: params.operadorId,
    titulo: `Atendimento assumido por ${params.operadorNome}`,
    metadados: { conversaId: params.conversaId },
    escritorioEvento: true,
  })
}

export function registrarIaRetomada(params: {
  conversaId: string
  operadorId: string
  operadorNome?: string
  clienteId?: string
  leadId?: string
}): void {
  registrar({
    tipo: 'ia_retomada',
    origem: 'usuario',
    clienteId: params.clienteId,
    leadId: params.leadId,
    usuarioId: params.operadorId,
    titulo: 'Conversa devolvida para a IA',
    metadados: { conversaId: params.conversaId },
    escritorioEvento: false,
  })
}

// ── Agente operacional ────────────────────────────────────────────────────────

export function registrarAgenteExecutou(params: {
  tool: string
  resumo: string
  sucesso: boolean
  clienteId?: string
  leadId?: string
  duracaoMs: number
}): void {
  registrar({
    tipo: params.sucesso ? 'agente_executou' : 'agente_falhou',
    origem: 'agente',
    clienteId: params.clienteId,
    leadId: params.leadId,
    titulo: `Agente: ${params.tool}`,
    conteudo: params.resumo,
    metadados: { tool: params.tool, sucesso: params.sucesso, duracaoMs: params.duracaoMs },
    escritorioEvento: !params.sucesso, // falhas aparecem no feed global
  })
}

// ── Mudança de status ─────────────────────────────────────────────────────────

export function registrarMudancaStatus(params: {
  entidade: 'cliente' | 'lead'
  entidadeId: string
  statusAnterior: string
  statusNovo: string
  usuarioId?: string
}): void {
  registrar({
    tipo: `${params.entidade}_status_mudou`,
    origem: params.usuarioId ? 'usuario' : 'sistema',
    clienteId: params.entidade === 'cliente' ? params.entidadeId : undefined,
    leadId:    params.entidade === 'lead'    ? params.entidadeId : undefined,
    usuarioId: params.usuarioId,
    titulo: `Status alterado: ${params.statusAnterior} → ${params.statusNovo}`,
    metadados: { de: params.statusAnterior, para: params.statusNovo },
    escritorioEvento: false,
  })
}

// ── Nota / interação manual (compatível com NovaInteracaoDrawer) ──────────────

export function registrarNota(params: {
  tipo: TipoEvento
  titulo?: string
  conteudo?: string
  clienteId?: string
  leadId?: string
  usuarioId: string
  metadados?: Record<string, unknown>
}): void {
  registrar({ ...params, origem: 'usuario' })
}

// ── Eventos de entidade ───────────────────────────────────────────────────────

export function registrarClienteCriado(params: {
  clienteId: string
  clienteNome: string
  usuarioId?: string
}): void {
  registrar({
    tipo: 'cliente_criado',
    origem: params.usuarioId ? 'usuario' : 'sistema',
    clienteId: params.clienteId,
    usuarioId: params.usuarioId,
    titulo: `Cliente criado: ${params.clienteNome}`,
    escritorioEvento: true,
  })
}
