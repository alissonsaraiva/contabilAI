'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'

type Mensagem = {
  id: string
  role: string
  conteudo: string
  criadaEm: string | Date
}

export function PortalConversaPanel({
  conversaId,
  nomeExibido,
  onClose,
}: {
  conversaId: string
  nomeExibido: string
  onClose: () => void
}) {
  const [mensagens, setMensagens]   = useState<Mensagem[]>([])
  const [pausada, setPausada]       = useState(false)
  const [assumindo, setAssumindo]   = useState(false)
  const [reativando, setReativando] = useState(false)
  const [texto, setTexto]           = useState('')
  const [sending, setSending]       = useState(false)
  const bottomRef                   = useRef<HTMLDivElement>(null)
  const isFirstLoadRef              = useRef(true)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversas/${conversaId}`)
      if (!res.ok) return
      const data = await res.json()
      setMensagens(data.mensagens ?? [])
      setPausada(data.pausada ?? false)
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao carregar mensagens:', { conversaId, err })
    }
  }, [conversaId])

  useEffect(() => { carregar() }, [carregar])

  // SSE — atualizações em tempo real quando cliente envia mensagem
  useEffect(() => {
    let es: EventSource
    let tentativas = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let encerrado = false

    function conectar() {
      es = new EventSource(`/api/stream/conversas/${conversaId}`)
      es.onmessage = () => { tentativas = 0; carregar() }
      es.onerror   = () => {
        es.close()
        if (encerrado || tentativas >= 5) return
        tentativas++
        timeoutId = setTimeout(conectar, Math.min(1000 * 2 ** tentativas, 30_000))
      }
    }

    conectar()
    return () => {
      encerrado = true
      if (timeoutId) clearTimeout(timeoutId)
      es.close()
    }
  }, [conversaId, carregar])

  // Polling de 8s como fallback (múltiplos workers não compartilham eventBus)
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) carregar()
    }, 8_000)
    return () => clearInterval(id)
  }, [carregar])

  // Scroll automático ao fundo
  useEffect(() => {
    if (mensagens.length === 0) return
    if (isFirstLoadRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      isFirstLoadRef.current = false
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  async function assumir() {
    setAssumindo(true)
    try {
      const res = await fetch('/api/conversas/pausar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ conversaId }),
      })
      if (!res.ok) { toast.error('Erro ao assumir controle'); return }
      setPausada(true)
      toast.success('Você assumiu o controle da conversa')
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao assumir controle:', { conversaId, err })
      toast.error('Erro ao assumir controle')
    } finally {
      setAssumindo(false)
    }
  }

  async function reativarIA() {
    setReativando(true)
    try {
      const res = await fetch(`/api/conversas/${conversaId}/retomar`, { method: 'POST' })
      if (!res.ok) { toast.error('Erro ao devolver à IA'); return }
      setPausada(false)
      toast.success('IA reativada')
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao reativar IA:', { conversaId, err })
      toast.error('Erro ao devolver à IA')
    } finally {
      setReativando(false)
    }
  }

  async function enviar() {
    if (!texto.trim() || sending) return
    const textoEnviar = texto.trim()
    setTexto('')
    setSending(true)
    try {
      const res = await fetch(`/api/conversas/${conversaId}/mensagem`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ texto: textoEnviar }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erro ao enviar mensagem')
        setTexto(textoEnviar)
        return
      }
      await carregar()
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao enviar mensagem:', { conversaId, err })
      toast.error('Erro ao enviar mensagem')
      setTexto(textoEnviar)
    } finally {
      setSending(false)
    }
  }

  function formatTime(d: string | Date): string {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  const initials = nomeExibido
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant/15 bg-card px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[12px] font-bold text-violet-600">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-on-surface">{nomeExibido}</p>
          <p className="text-[11px] text-violet-500">Portal do cliente</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {mensagens.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-on-surface-variant/50">Sem mensagens</p>
        ) : (
          mensagens.map(m => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'assistant' ? 'flex-row-reverse' : ''}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                m.role === 'assistant'
                  ? 'rounded-tr-sm bg-violet-500/10 text-on-surface'
                  : 'rounded-tl-sm bg-surface-container text-on-surface'
              }`}>
                <p className="whitespace-pre-wrap">{m.conteudo}</p>
                <p className={`mt-1 text-[10px] ${
                  m.role === 'assistant' ? 'text-right text-violet-400/80' : 'text-on-surface-variant/40'
                }`}>
                  {formatTime(m.criadaEm)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      {pausada ? (
        <div className="shrink-0 space-y-2 border-t border-outline-variant/15 bg-card p-3">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              placeholder="Digite uma resposta..."
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              disabled={sending}
            />
            <button
              onClick={enviar}
              disabled={!texto.trim() || sending}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white transition-colors hover:bg-violet-600 disabled:opacity-40"
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                send
              </span>
            </button>
          </div>
          <button
            onClick={reativarIA}
            disabled={reativando}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-outline-variant/25 py-2 text-[12px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">smart_toy</span>
            {reativando ? 'Devolvendo...' : 'Devolver à IA'}
          </button>
        </div>
      ) : (
        <div className="shrink-0 border-t border-outline-variant/15 bg-card p-3">
          <button
            onClick={assumir}
            disabled={assumindo}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">headset_mic</span>
            {assumindo ? 'Assumindo...' : 'Assumir controle desta conversa'}
          </button>
        </div>
      )}
    </div>
  )
}
