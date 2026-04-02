/**
 * EventBus — singleton in-memory para push de eventos entre Route Handlers e clientes SSE.
 *
 * Funciona em single-instance (VPS Docker). Se o deploy escalar para múltiplos containers,
 * trocar o EventEmitter por Redis pub/sub mantendo a mesma interface de emit/on/off.
 *
 * Eventos disponíveis:
 *   conversa:{conversaId}   → new message in a conversa (portal operator → client)
 *   escalacao:{escalacaoId} → escalation resolved (onboarding/portal widget)
 *   whatsapp:{conversaId}   → new WhatsApp message arrived (CRM drawer)
 */

import { EventEmitter } from 'events'

const KEY = '__contabai_event_bus__'
const g = globalThis as Record<string, unknown>

if (!g[KEY]) {
  const bus = new EventEmitter()
  bus.setMaxListeners(500)
  g[KEY] = bus
}

export const eventBus = g[KEY] as EventEmitter

// ── Helpers tipados ──────────────────────────────────────────────────────────

export type EventConversaMensagem = {
  id?: string          // ID da MensagemIA — usado pelo portal Clara para rastrear exclusões
  role: 'assistant' | 'user'
  conteudo: string
  mediaUrl?: string | null
  mediaType?: string | null
  mediaFileName?: string | null
}

export type EventEscalacaoResolvida = {
  status: 'resolvida'
  resposta: string
}

export type EventWhatsAppRefresh = {
  type: 'refresh'
}

export function emitConversaMensagem(conversaId: string, payload: EventConversaMensagem) {
  eventBus.emit(`conversa:${conversaId}`, payload)
}

export function emitEscalacaoResolvida(escalacaoId: string, payload: EventEscalacaoResolvida) {
  eventBus.emit(`escalacao:${escalacaoId}`, payload)
}

export function emitWhatsAppRefresh(conversaId: string) {
  eventBus.emit(`whatsapp:${conversaId}`, { type: 'refresh' } satisfies EventWhatsAppRefresh)
}

// ── Portal: mensagem do cliente durante conversa pausada ─────────────────────

export type EventPortalUserMessage = { type: 'portal-user-message' }

export function emitPortalUserMessage(conversaId: string) {
  eventBus.emit(`portal-user:${conversaId}`, { type: 'portal-user-message' } satisfies EventPortalUserMessage)
}

// ── Exclusão de mensagem (operador apagou para todos) ─────────────────────────

export type EventMensagemExcluida = { type: 'mensagem_excluida'; mensagemId: string }

export function emitMensagemExcluida(conversaId: string, mensagemId: string) {
  eventBus.emit(
    `mensagem-excluida:${conversaId}`,
    { type: 'mensagem_excluida', mensagemId } satisfies EventMensagemExcluida,
  )
}
