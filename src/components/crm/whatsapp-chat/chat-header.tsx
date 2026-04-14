'use client'

import { useState, useRef, useEffect } from 'react'
import type { AtribuidoPara } from './use-whatsapp-chat'

export type OperadorOpcao = { id: string; nome: string; tipo: string }

type Props = {
  nomeExibido: string
  telefone: string | null
  pausada: boolean
  reativando: boolean
  assumindo: boolean
  conversaId: string | null
  mensagensCount: number
  atribuidaPara: AtribuidoPara
  atribuindo: boolean
  operadores: OperadorOpcao[]
  onClose: () => void
  onReativarIA: () => void
  onAssumir: () => void
  onAtribuir: (operadorId: string | null, operadorNome: string | null) => void
}

export function ChatHeader({
  nomeExibido, telefone, pausada, reativando, assumindo,
  conversaId, mensagensCount,
  atribuidaPara, atribuindo, operadores,
  onClose, onReativarIA, onAssumir, onAtribuir,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!dropdownOpen) return
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  function handleAtribuir(operadorId: string | null, operadorNome: string | null) {
    setDropdownOpen(false)
    onAtribuir(operadorId, operadorNome)
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-outline-variant/15 px-4 lg:px-5 py-4">
      <div className="flex items-center gap-2 lg:gap-3">
        <button
          onClick={onClose}
          className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15">
          <span
            className="material-symbols-outlined text-[18px] text-[#25D366]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            chat_bubble
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-on-surface">{nomeExibido}</p>
          <p className="text-[11px] text-on-surface-variant">{telefone ?? 'WhatsApp'}</p>
        </div>
        <button
          onClick={onClose}
          className="hidden lg:flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Linha de status: pausa/IA + atribuição */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Badge de estado IA/humano */}
        {pausada ? (
          <>
            <span className="flex items-center gap-1 rounded-full bg-orange-status/10 px-2.5 py-1 text-[11px] font-semibold text-orange-status">
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                support_agent
              </span>
              Você no controle
            </span>
            <button
              onClick={onReativarIA}
              disabled={reativando}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                smart_toy
              </span>
              {reativando ? 'Devolvendo...' : 'Devolver para IA'}
            </button>
          </>
        ) : (conversaId || mensagensCount > 0) ? (
          <>
            <span className="flex items-center gap-1 rounded-full bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-semibold text-[#25D366]">
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                smart_toy
              </span>
              IA ativa
            </span>
            {conversaId && (
              <button
                onClick={onAssumir}
                disabled={assumindo}
                className="flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[13px]">support_agent</span>
                {assumindo ? 'Assumindo...' : 'Assumir'}
              </button>
            )}
          </>
        ) : null}

        {/* Atribuição — sempre visível quando há conversa */}
        {conversaId && (
          <div ref={dropdownRef} className="relative ml-auto">
            <button
              onClick={() => setDropdownOpen(v => !v)}
              disabled={atribuindo}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                atribuidaPara
                  ? 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/20'
                  : 'bg-surface-container text-on-surface-variant/60 hover:bg-surface-container-high hover:text-on-surface-variant'
              }`}
              title={atribuidaPara ? `Atribuído para ${atribuidaPara.nome}` : 'Atribuir conversa'}
            >
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                person_pin
              </span>
              <span className="hidden sm:inline max-w-[7rem] truncate">
                {atribuindo ? 'Salvando...' : (atribuidaPara?.nome ?? 'Atribuir')}
              </span>
              <span className="material-symbols-outlined text-[11px]">expand_more</span>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-[12px] border border-outline-variant/15 bg-card shadow-lg">
                <div className="px-3 pt-2.5 pb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
                    Atribuir para
                  </p>
                </div>
                <div className="max-h-52 overflow-y-auto py-1">
                  {operadores.map(op => (
                    <button
                      key={op.id}
                      onClick={() => handleAtribuir(op.id, op.nome)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-surface-container-low ${
                        atribuidaPara?.id === op.id ? 'font-semibold text-violet-600' : 'text-on-surface'
                      }`}
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-[9px] font-bold text-violet-600">
                        {op.nome.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 truncate">{op.nome}</span>
                      {atribuidaPara?.id === op.id && (
                        <span className="material-symbols-outlined text-[14px] text-violet-600">check</span>
                      )}
                    </button>
                  ))}
                </div>
                {atribuidaPara && (
                  <>
                    <div className="mx-3 border-t border-outline-variant/10" />
                    <div className="py-1">
                      <button
                        onClick={() => handleAtribuir(null, null)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-on-surface-variant/60 transition-colors hover:bg-surface-container-low hover:text-error"
                      >
                        <span className="material-symbols-outlined text-[14px]">person_remove</span>
                        Remover atribuição
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
