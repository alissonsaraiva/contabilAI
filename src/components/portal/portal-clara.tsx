'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

type Msg = { role: 'user' | 'assistant'; text: string }

function newSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getOrCreatePortalSessionId(): string {
  const storageKey = 'portal_clara_session'
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) return stored
    const fresh = newSessionId()
    localStorage.setItem(storageKey, fresh)
    return fresh
  } catch {
    return newSessionId()
  }
}

export function PortalClara({ nomeIa = 'Clara' }: { nomeIa?: string }) {
  const [open, setOpen]       = useState(false)
  const [msgs, setMsgs]       = useState<Msg[]>([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [escalando, setEscalando] = useState(false)
  const [escalada, setEscalada]   = useState(false)
  const sessionIdRef          = useRef<string>('')
  const historyLoadedRef      = useRef(false)
  const bottomRef             = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  // sessionId estável — persiste entre navegações via localStorage
  if (!sessionIdRef.current) {
    sessionIdRef.current = typeof window !== 'undefined'
      ? getOrCreatePortalSessionId()
      : newSessionId()
  }
  const sessionId = sessionIdRef.current

  const greeting: Msg = {
    role: 'assistant',
    text: `Olá! Sou ${nomeIa}, da equipe do escritório. Posso ajudar com dúvidas sobre contabilidade, obrigações fiscais, seu plano e muito mais. Como posso te ajudar?`,
  }

  // Carrega histórico da sessão na primeira abertura
  useEffect(() => {
    if (!open || historyLoadedRef.current) return
    historyLoadedRef.current = true
    fetch(`/api/portal/chat?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(({ mensagens }) => {
        if (Array.isArray(mensagens) && mensagens.length > 0) {
          setMsgs(mensagens.map((m: { role: string; conteudo: string }) => ({
            role: m.role as 'user' | 'assistant',
            text: m.conteudo,
          })))
        }
      })
      .catch(() => {})
  }, [open, sessionId])

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        inputRef.current?.focus()
      }, 100)
    }
  }, [open, msgs])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setMsgs(m => [...m, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/portal/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, sessionId }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Erro desconhecido' }))
        setMsgs(m => [...m, { role: 'assistant', text: `⚠️ ${error}` }])
      } else {
        const { reply } = await res.json()
        setMsgs(m => [...m, { role: 'assistant', text: reply }])
      }
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Não consegui me conectar. Verifique sua conexão e tente novamente.' }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, sessionId])

  const handleEscalar = useCallback(async () => {
    setEscalando(true)
    try {
      const res = await fetch('/api/portal/escalacao', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId }),
      })
      if (res.ok) {
        setEscalada(true)
        setMsgs(m => [...m, {
          role: 'assistant',
          text: '✅ **Solicitação enviada!** Um especialista da nossa equipe entrará em contato em breve pelo WhatsApp ou e-mail cadastrado.',
        }])
      }
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Não consegui registrar sua solicitação. Tente novamente.' }])
    } finally {
      setEscalando(false)
    }
  }, [sessionId])

  const allMsgs = [greeting, ...msgs]

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all active:scale-95 md:bottom-6 md:right-6"
        aria-label="Falar com Clara"
      >
        <span
          className="material-symbols-outlined text-[24px]"
          style={{ fontVariationSettings: open ? "'FILL' 0" : "'FILL' 1" }}
        >
          {open ? 'close' : 'support_agent'}
        </span>
      </button>

      {/* Painel de chat */}
      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex h-[480px] w-[340px] flex-col overflow-hidden rounded-[20px] border border-outline-variant/15 bg-card shadow-2xl md:bottom-24 md:right-6 md:w-[380px]">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-outline-variant/10 bg-primary/5 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                support_agent
              </span>
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-on-surface">{nomeIa}</p>
              <p className="text-[11px] text-on-surface-variant/60">Atendimento online</p>
            </div>
            {!escalada && (
              <button
                onClick={handleEscalar}
                disabled={escalando}
                title="Falar com um especialista"
                className="flex items-center gap-1 rounded-lg bg-surface-container px-2.5 py-1.5 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[14px]">person_raised_hand</span>
                <span className="hidden sm:block">Especialista</span>
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant/60 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Mensagens */}
          <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {allMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-primary text-white rounded-br-sm'
                      : 'bg-surface-container-low text-on-surface rounded-bl-sm'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        p:      ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        ul:     ({ children }) => <ul className="ml-3 list-disc space-y-0.5">{children}</ul>,
                        li:     ({ children }) => <li>{children}</li>,
                      }}
                    >
                      {m.text}
                    </ReactMarkdown>
                  ) : (
                    <p>{m.text}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-surface-container-low px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40 animate-bounce"
                        style={{ animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-outline-variant/10 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder={`Pergunte para ${nomeIa}…`}
                className="flex-1 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3.5 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary/50 focus:ring-[3px] focus:ring-primary/10 transition-all"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
