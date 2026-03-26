'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  conversaId: string
  canal: string
  pausada: boolean
}

export function ConversaRodape({ conversaId, canal, pausada }: Props) {
  const router = useRouter()
  const [assumido, setAssumido] = useState(pausada)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function assumir() {
    await fetch('/api/conversas/pausar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversaId }),
    })
    setAssumido(true)
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  async function devolverIA() {
    await fetch(`/api/conversas/${conversaId}/retomar`, { method: 'POST' })
    setAssumido(false)
    setTexto('')
  }

  async function enviar() {
    if (!texto.trim() || enviando) return
    setEnviando(true)
    try {
      await fetch(`/api/conversas/${conversaId}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      setTexto('')
      router.refresh()
    } finally {
      setEnviando(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  if (!assumido) {
    return (
      <div className="sticky bottom-0 border-t border-outline-variant/15 bg-card/95 backdrop-blur-md px-6 py-4">
        <button
          onClick={assumir}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-primary px-6 py-3.5 text-[14px] font-semibold text-white shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            support_agent
          </span>
          Assumir controle desta conversa
        </button>
        {canal === 'whatsapp' && (
          <p className="mt-2 text-center text-[11px] text-on-surface-variant/50">
            A IA será pausada e você poderá responder diretamente
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="sticky bottom-0 border-t border-outline-variant/15 bg-card/95 backdrop-blur-md px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={canal === 'whatsapp' ? 'Digite sua mensagem... (Enter para enviar)' : 'Digite sua resposta...'}
          rows={1}
          className="flex-1 resize-none rounded-[12px] border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-[13px] text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none focus:ring-[3px] focus:ring-primary/10 max-h-40 overflow-y-auto"
          style={{ minHeight: '44px' }}
          onInput={e => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`
          }}
        />
        <button
          onClick={enviar}
          disabled={!texto.trim() || enviando}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-primary text-white shadow-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            {enviando ? 'hourglass_empty' : 'send'}
          </span>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 px-1">
        <button
          onClick={devolverIA}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
          Devolver para IA
        </button>
        <p className="text-[10px] text-on-surface-variant/40">
          Você está no controle · IA pausada · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  )
}
