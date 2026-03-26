'use client'

import { useState, useEffect, useRef, useCallback, Component, type ReactNode, type ErrorInfo } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { toast } from 'sonner'

type Mensagem = {
  id: string
  role: string
  conteudo: string
  criadaEm: string | Date
  status?: 'pending' | 'sent' | 'failed'
  erroEnvio?: string | null
}

type Props = {
  /** Base path da API, ex: /api/clientes/[id]/whatsapp ou /api/leads/[id]/whatsapp */
  apiPath: string
  nomeExibido: string
  open: boolean
  onClose: () => void
}

const POLL_INTERVAL = 4000

// ─── Error Boundary ───────────────────────────────────────────────────────────

class WhatsAppDrawerBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WhatsAppDrawer] render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-error/60">error</span>
          <p className="text-[13px] font-medium text-on-surface">Erro ao carregar conversa</p>
          <p className="text-[11px] text-on-surface-variant/60">{this.state.error?.message}</p>
          <button
            onClick={this.props.onClose}
            className="rounded-lg bg-surface-container px-4 py-2 text-[12px] text-on-surface hover:bg-surface-container-high"
          >
            Fechar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

export function WhatsAppDrawer({ apiPath, nomeExibido, open, onClose }: Props) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [pausada, setPausada] = useState(false)
  const [telefone, setTelefone] = useState<string | null>(null)
  const [semNumero, setSemNumero] = useState(false)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [reativando, setReativando] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(apiPath)
      if (!res.ok) return
      const data = await res.json()
      if (!data.telefone && !data.conversa) {
        setSemNumero(true)
        return
      }
      setSemNumero(false)
      setMensagens(data.mensagens ?? [])
      setPausada(data.pausada ?? false)
      setTelefone(data.telefone ?? null)
    } catch {}
  }, [apiPath])

  useEffect(() => {
    if (!open) return
    carregar()
    const interval = setInterval(carregar, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [open, carregar])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, open])

  async function enviar() {
    if (!texto.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: texto.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        // 502 = mensagem salva mas não entregue — avisa com mais contexto
        if (res.status === 502) {
          toast.error('Mensagem salva, mas não foi entregue ao WhatsApp. Tente reenviar.')
        } else {
          toast.error(err.error ?? 'Erro ao enviar mensagem')
        }
        await carregar() // atualiza para mostrar o status 'failed' na bolha
        return
      }
      setTexto('')
      await carregar()
    } catch {
      toast.error('Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  async function reativarIA() {
    setReativando(true)
    try {
      await fetch(`${apiPath}/reativar`, { method: 'POST' })
      setPausada(false)
      toast.success('IA reativada para esta conversa')
    } catch {
      toast.error('Erro ao reativar IA')
    } finally {
      setReativando(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 p-0">
        <WhatsAppDrawerBoundary onClose={onClose}>

          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-outline-variant/15 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15">
              <span
                className="material-symbols-outlined text-[18px] text-[#25D366]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                chat_bubble
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-on-surface">{nomeExibido}</p>
              <p className="text-[11px] text-on-surface-variant">{telefone ?? 'WhatsApp'}</p>
            </div>

            {pausada ? (
              <button
                onClick={reativarIA}
                disabled={reativando}
                className="flex items-center gap-1.5 rounded-full bg-orange-status/10 px-3 py-1.5 text-[11px] font-semibold text-orange-status transition-colors hover:bg-orange-status/20 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  smart_toy
                </span>
                Reativar IA
              </button>
            ) : mensagens.length > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-semibold text-[#25D366]">
                <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  smart_toy
                </span>
                IA ativa
              </span>
            ) : null}
          </div>

          {/* Banner de pausa */}
          {pausada && (
            <div className="shrink-0 border-b border-orange-status/10 bg-orange-status/5 px-5 py-2.5">
              <p className="text-[12px] text-orange-status">
                <span className="font-semibold">IA pausada.</span> Você está no controle. O contato não receberá respostas automáticas até você reativar.
              </p>
            </div>
          )}

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
            {semNumero ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">
                  phone_disabled
                </span>
                <p className="text-[13px] font-medium text-on-surface-variant">Sem número cadastrado</p>
                <p className="mt-1 text-[12px] text-on-surface-variant/60">
                  Adicione o telefone/WhatsApp para enviar mensagens.
                </p>
              </div>
            ) : mensagens.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">
                  chat_bubble
                </span>
                <p className="text-[13px] font-medium text-on-surface-variant">Nenhuma mensagem ainda</p>
                <p className="mt-1 text-[12px] text-on-surface-variant/60">
                  Envie a primeira mensagem para iniciar a conversa
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {mensagens.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    {m.role === 'user' && (
                      <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15">
                        <span className="material-symbols-outlined text-[12px] text-[#25D366]">person</span>
                      </div>
                    )}
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                        m.role === 'user'
                          ? 'rounded-bl-md bg-surface-container text-on-surface'
                          : m.status === 'failed'
                            ? 'rounded-br-md bg-error/10 text-on-surface ring-1 ring-error/20'
                            : 'rounded-br-md bg-primary text-white'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.conteudo}</p>
                      <p className={`mt-1 text-[10px] ${m.role === 'user' ? 'text-on-surface-variant/50' : m.status === 'failed' ? 'text-error/60' : 'text-white/50'}`}>
                        {new Date(m.criadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {m.role === 'assistant' && m.status === 'failed' && (
                        <p
                          className="mt-0.5 flex items-center gap-1 text-[10px] text-error/70"
                          title={m.erroEnvio ?? 'Falha no envio'}
                        >
                          <span className="material-symbols-outlined text-[10px]">error</span>
                          Não entregue
                        </p>
                      )}
                    </div>
                    {m.role === 'assistant' && (
                      <div className="ml-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <span
                          className="material-symbols-outlined text-[12px] text-primary"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          smart_toy
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input */}
          {!semNumero && (
            <div className="shrink-0 border-t border-outline-variant/15 px-4 py-4">
              <div className="flex gap-2">
                <textarea
                  rows={1}
                  className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] text-on-surface transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40"
                  placeholder="Digite uma mensagem..."
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
                  }}
                />
                <button
                  onClick={enviar}
                  disabled={!texto.trim() || sending}
                  className="flex h-10 w-10 shrink-0 self-end items-center justify-center rounded-xl bg-[#25D366] text-white transition-colors hover:bg-[#1fb855] disabled:opacity-40"
                >
                  {sending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      send
                    </span>
                  )}
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-on-surface-variant/50">
                {pausada
                  ? 'Você está no controle · IA pausada'
                  : 'Ao enviar, a IA será pausada automaticamente'}
              </p>
            </div>
          )}

        </WhatsAppDrawerBoundary>
      </SheetContent>
    </Sheet>
  )
}
