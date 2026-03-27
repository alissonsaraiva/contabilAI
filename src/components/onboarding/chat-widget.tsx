'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { stripMarkdown } from '@/lib/utils/split-chunks'

type Msg = { role: 'user' | 'assistant'; text: string }

function buildGreeting(nomeIa: string): Msg {
  return {
    role: 'assistant',
    text: `Olá! Sou ${nomeIa}. Estou aqui para te ajudar durante o cadastro. Tem alguma dúvida sobre o plano escolhido, os documentos ou as próximas etapas? 😊`,
  }
}

// Gera um ID de sessão por instância do widget
function newSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Gate: só renderiza o widget quando o lead já foi criado (leadId na URL)
export function ChatWidget() {
  const searchParams = useSearchParams()
  const leadId = searchParams.get('leadId') ?? undefined
  const plano  = searchParams.get('plano')  ?? undefined
  if (!leadId) return null
  return <ChatWidgetInner leadId={leadId} plano={plano} />
}

function ChatWidgetInner({ leadId, plano }: { leadId: string; plano?: string }) {
  const [sessionId] = useState(newSessionId)
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([buildGreeting('nosso assistente')])

  // Busca nome da IA configurado no CRM e atualiza a saudação
  useEffect(() => {
    fetch('/api/onboarding/config')
      .then(r => r.json())
      .then((data: { nomeIa?: string }) => {
        if (data.nomeIa) {
          setMsgs(prev =>
            prev.length === 1 && prev[0].role === 'assistant'
              ? [buildGreeting(data.nomeIa!)]
              : prev,
          )
        }
      })
      .catch(() => {})
  }, [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [escalacaoId, setEscalacaoId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, msgs])

  // Polling quando escalado — aguarda resposta humana (timeout 20min)
  const startPolling = useCallback((escId: string) => {
    const deadline = Date.now() + 20 * 60 * 1000
    const poll = async () => {
      // Timeout: desiste após 20min e reabilita o input
      if (Date.now() > deadline) {
        setMsgs(m => [...m, {
          role: 'assistant',
          text: 'Nossa equipe está ocupada no momento. Deixe seu contato que retornaremos assim que possível.',
        }])
        setEscalacaoId(null)
        setLoading(false)
        return
      }
      try {
        const res = await fetch(`/api/escalacoes/${escId}/poll`)
        if (!res.ok) {
          // Escalação não encontrada ou erro — para o poll
          setEscalacaoId(null)
          setLoading(false)
          return
        }
        const data = await res.json()
        if (data.status === 'resolvida' && data.resposta) {
          setMsgs(m => [...m, { role: 'assistant', text: data.resposta }])
          setEscalacaoId(null)
          setLoading(false)
          return
        }
      } catch { /* ignora erros de rede, tenta novamente */ }
      pollRef.current = setTimeout(poll, 4000)
    }
    pollRef.current = setTimeout(poll, 4000)
  }, [])

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading || escalacaoId) return

    const history = msgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text }))
    setMsgs(m => [...m, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/onboarding/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, leadId, sessionId, plano }),
      })
      const data = await res.json()

      if (data.escalado) {
        setMsgs(m => [...m, { role: 'assistant', text: data.reply }])
        if (data.escalacaoId) {
          setEscalacaoId(data.escalacaoId)
          startPolling(data.escalacaoId)
          // loading permanece true até o poll resolver
        } else {
          // DB falhou ao criar escalação — reabilita input
          setLoading(false)
        }
      } else {
        setMsgs(m => [...m, { role: 'assistant', text: stripMarkdown(data.reply ?? '') }])
        setLoading(false)
      }
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Desculpe, ocorreu um erro. Tente novamente.' }])
      setLoading(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat panel — bottom sheet no mobile */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg transition-all duration-300 ease-out ${
          open ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        <div className="rounded-t-3xl border border-outline-variant/15 bg-white shadow-2xl flex flex-col"
          style={{ height: '72vh', maxHeight: 560 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                  smart_toy
                </span>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-on-surface">Assistente ContabAI</p>
                <p className="text-[11px] text-green-status font-medium flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-status inline-block" />
                  Online
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="material-symbols-outlined text-[14px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                      smart_toy
                    </span>
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-primary text-white rounded-br-md'
                      : 'bg-surface-container-low text-on-surface rounded-bl-md'
                  }`}
                >
                  {m.text.split('\n').map((line, i, arr) => (
                    <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                  ))}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="material-symbols-outlined text-[14px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {escalacaoId ? 'support_agent' : 'smart_toy'}
                  </span>
                </div>
                <div className="rounded-2xl rounded-bl-md bg-surface-container-low px-4 py-3">
                  {escalacaoId ? (
                    <p className="text-[12px] text-on-surface-variant italic">Aguardando um especialista da equipe...</p>
                  ) : (
                    <div className="flex gap-1 items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
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
                className="flex-1 bg-transparent text-[14px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
                placeholder="Tire sua dúvida..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                disabled={loading || !!escalacaoId}
              />
              <button
                onClick={handleSend}
                disabled={loading || !!escalacaoId || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-all hover:bg-primary/90 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-on-surface-variant/40">
              Powered by ContabAI · Respostas podem conter erros
            </p>
          </div>
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-all hover:scale-105 hover:shadow-xl active:scale-95 ${open ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <span className="material-symbols-outlined text-[26px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
          chat
        </span>
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-status text-[9px] font-bold text-white">
          ?
        </span>
      </button>
    </>
  )
}
