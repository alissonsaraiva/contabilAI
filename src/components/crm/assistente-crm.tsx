'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAssistente } from './assistente-context'

type Msg = { role: 'user' | 'assistant'; text: string }

function newSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getOrCreateSessionId(contextKey: string): string {
  const storageKey = `crm_session_${contextKey}`
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

export function AssistenteCRM({ nomeIa = 'Clara' }: { nomeIa?: string }) {
  const { clienteId, leadId, nomeCliente } = useAssistente()

  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // sessionId estável por contexto — persiste no localStorage entre navegações
  const contextKey = clienteId ?? leadId ?? 'global'
  const sessionIdRef = useRef<string>('')
  if (!sessionIdRef.current || sessionIdRef.current === '') {
    sessionIdRef.current = typeof window !== 'undefined'
      ? getOrCreateSessionId(contextKey)
      : newSessionId()
  }
  // Greeting dinâmico baseado no contexto atual
  const greeting: Msg = {
    role: 'assistant',
    text: clienteId || leadId
      ? `Olá! Sou ${nomeIa}. Estou com o contexto de **${nomeCliente}** carregado — histórico de conversas, dados fiscais, interações e contratos. O que quer saber?`
      : `Olá! Sou ${nomeIa}, sua assistente de CRM. Posso ajudar com informações gerais do escritório, comparar clientes, ou navegar até um cliente/lead para ter contexto específico.`,
  }

  // Carrega histórico da sessão na primeira abertura
  const historyLoadedRef = useRef(false)

  // Reseta o chat quando o contexto muda (troca de cliente/lead)
  // Permite abrir via CustomEvent('open-assistente') disparado por outros componentes
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('open-assistente', handler)
    return () => window.removeEventListener('open-assistente', handler)
  }, [])

  const prevContextRef = useRef({ clienteId, leadId })
  useEffect(() => {
    const prev = prevContextRef.current
    if (prev.clienteId !== clienteId || prev.leadId !== leadId) {
      setMsgs([])
      historyLoadedRef.current = false
      sessionIdRef.current = typeof window !== 'undefined'
        ? getOrCreateSessionId(clienteId ?? leadId ?? 'global')
        : newSessionId()
      prevContextRef.current = { clienteId, leadId }
    }
  }, [clienteId, leadId])
  useEffect(() => {
    if (!open || historyLoadedRef.current) return
    historyLoadedRef.current = true
    fetch(`/api/crm/ai/chat?sessionId=${sessionIdRef.current}`)
      .then(r => r.json())
      .then(({ mensagens }) => {
        if (Array.isArray(mensagens) && mensagens.length > 0) {
          setMsgs(mensagens.map((m: { role: string; conteudo: string }) => ({
            role: m.role as 'user' | 'assistant',
            text: m.conteudo,
          })))
        }
      })
      .catch(err => console.error('[crm/assistente] falha ao carregar conversas:', err))
  }, [open])

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
      const res = await fetch('/api/crm/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionIdRef.current, clienteId, leadId }),
      })
      const data = await res.json()
      setMsgs(m => [...m, { role: 'assistant', text: data.reply ?? 'Sem resposta.' }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Erro ao conectar. Tente novamente.' }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, clienteId, leadId])

  const allMsgs = msgs.length === 0 ? [greeting] : msgs

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/10"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Painel lateral */}
      <div className={`fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-sm flex-col bg-card shadow-2xl border-l border-outline-variant/15 transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/10 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              smart_toy
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-on-surface">Assistente IA</p>
            <p className="truncate text-[11px] text-on-surface-variant">{nomeCliente}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
          {allMsgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="material-symbols-outlined text-[13px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                    smart_toy
                  </span>
                </div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.role === 'user'
                  ? 'bg-primary text-white rounded-br-md whitespace-pre-wrap'
                  : 'bg-surface-container-low text-on-surface rounded-bl-md'
              }`}>
                {m.role === 'assistant' ? (
                  <ReactMarkdown components={{
                    h1: ({ children }) => <p className="font-bold text-[14px] mt-2 mb-1 text-on-surface">{children}</p>,
                    h2: ({ children }) => <p className="font-semibold text-[13px] mt-2 mb-1 text-on-surface">{children}</p>,
                    h3: ({ children }) => <p className="font-semibold text-[12px] mt-1.5 mb-0.5 text-on-surface">{children}</p>,
                    p:  ({ children }) => <p className="my-1">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-on-surface">{children}</strong>,
                    ul: ({ children }) => <ul className="my-1 space-y-0.5 pl-3">{children}</ul>,
                    ol: ({ children }) => <ol className="my-1 space-y-0.5 pl-3 list-decimal">{children}</ol>,
                    li: ({ children }) => <li className="flex gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-on-surface-variant/50" /><span>{children}</span></li>,
                    hr: () => <hr className="my-2 border-outline-variant/20" />,
                    code: ({ children }) => <code className="rounded bg-surface-container px-1 py-0.5 text-[11px] font-mono">{children}</code>,
                  }}>
                    {m.text}
                  </ReactMarkdown>
                ) : m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <span className="material-symbols-outlined text-[13px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              </div>
              <div className="rounded-2xl rounded-bl-md bg-surface-container-low px-4 py-3">
                <div className="flex gap-1 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-outline-variant/10 px-4 py-3">
          <div className="flex items-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-container-low/50 px-4 py-2">
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
              placeholder={clienteId || leadId ? `Perguntar sobre ${nomeCliente}...` : 'Perguntar sobre o escritório...'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-all hover:bg-primary/90 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-on-surface-variant/40">
            {clienteId || leadId ? 'Acesso total — histórico, dados do contrato, conversas' : 'Contexto geral do escritório'}
          </p>
        </div>
      </div>

      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95 ${open ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        title="Assistente IA"
      >
        <span className="material-symbols-outlined text-[24px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
          smart_toy
        </span>
      </button>
    </>
  )
}
