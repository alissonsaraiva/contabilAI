'use client'

import type { ConversaWebItem, SelectedConversation } from './types'
import { getApiPath, getNome, getInitials, formatTimeShort } from './helpers'

// ─── Seção de conversas ──────────────────────────────────────────────────────

export function ConversaSection({
  titulo,
  corTitulo,
  items,
  urgente,
  selected,
  onSelect,
}: {
  titulo: string
  corTitulo: string
  items: ConversaWebItem[]
  urgente?: boolean
  selected: SelectedConversation | null
  onSelect: (c: ConversaWebItem) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <p className={`flex-1 text-[11px] font-semibold uppercase tracking-wider ${corTitulo}`}>{titulo}</p>
        <span className={`rounded-full px-1.5 text-[10px] font-bold ${
          urgente ? 'bg-error/10 text-error' : 'bg-surface-container text-on-surface-variant'
        }`}>
          {items.length}
        </span>
      </div>
      {items.map(c => (
        <ConversaItem
          key={c.id}
          c={c}
          urgente={urgente}
          isSelected={
            c.canal === 'portal'
              ? selected?.type === 'portal' && selected.conversaId === c.id
              : selected?.type === 'whatsapp' && selected.apiPath === (getApiPath(c) ?? `/api/conversas/${c.id}`)
          }
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

// ─── Item de conversa ────────────────────────────────────────────────────────

function ConversaItem({
  c,
  urgente,
  isSelected,
  onSelect,
}: {
  c: ConversaWebItem
  urgente?: boolean
  isSelected?: boolean
  onSelect: (c: ConversaWebItem) => void
}) {
  const nome           = getNome(c)
  const initials       = getInitials(nome)
  const ultimaMensagem = c.mensagens[0]

  return (
    <button
      onClick={() => onSelect(c)}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-low ${
        isSelected ? 'bg-primary/5 border-l-2 border-primary' : ''
      } ${urgente && !isSelected ? 'border-l-2 border-error' : ''}`}
    >
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
        urgente ? 'bg-error/15 text-error' : 'bg-surface-container text-on-surface-variant'
      }`}>
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="flex-1 truncate text-[13px] font-semibold text-on-surface">{nome}</p>
          <span className="shrink-0 text-[10px] text-on-surface-variant/40">
            {formatTimeShort(c.atualizadaEm)}
          </span>
        </div>
        {ultimaMensagem && (
          <p className={`mt-0.5 truncate text-[11px] leading-relaxed ${urgente ? 'font-medium text-on-surface' : 'text-on-surface-variant/60'}`}>
            {ultimaMensagem.role === 'assistant' && (
              <span className="text-on-surface-variant/40">IA: </span>
            )}
            {ultimaMensagem.conteudo}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-medium ${
            c.canal === 'whatsapp' ? 'text-[#25D366]' :
            c.canal === 'portal'   ? 'text-violet-500' : 'text-blue-500'
          }`}>
            {c.canal === 'whatsapp' ? 'WhatsApp' : c.canal === 'portal' ? 'Portal' : 'Site'}
          </span>
          {urgente ? (
            <span className="rounded-full bg-error/10 px-1.5 text-[10px] font-semibold text-error">nova msg</span>
          ) : c.pausadaEm ? (
            <span className="rounded-full bg-orange-status/10 px-1.5 text-[10px] font-semibold text-orange-status">humano</span>
          ) : (
            <span className="rounded-full bg-green-status/10 px-1.5 text-[10px] font-semibold text-green-status">IA</span>
          )}
          {/* Operador atribuído */}
          {c.atribuidaPara && (
            <span className="flex items-center gap-0.5 rounded-full bg-violet-500/10 px-1.5 text-[10px] font-semibold text-violet-600">
              <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>person_pin</span>
              {c.atribuidaPara.nome.split(' ')[0]}
            </span>
          )}
        </div>
      </div>

      {urgente && (
        <div className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-error" />
      )}
    </button>
  )
}
