'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { formatDateTime } from '@/lib/utils'

type Mensagem = {
  id: string
  role: string
  conteudo: string
  criadaEm: string | Date
}

type Conversa = {
  id: string
  criadaEm: string | Date
  atualizadaEm: string | Date
  mensagens: Mensagem[]
}

type Props = {
  clienteId: string
  clienteNome: string
  open: boolean
  onClose: () => void
}

export function PortalChatDrawer({ clienteId, clienteNome, open, onClose }: Props) {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [loading, setLoading] = useState(false)
  const [conversaAberta, setConversaAberta] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/crm/clientes/${clienteId}/portal-chat`)
      .then(r => r.json())
      .then((data: { conversas: Conversa[] }) => {
        setConversas(data.conversas ?? [])
        if (data.conversas?.length === 1) setConversaAberta(data.conversas[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, clienteId])

  useEffect(() => { load() }, [load])

  const conversaAtual = conversas.find(c => c.id === conversaAberta)

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="flex w-[420px] flex-col p-0 sm:max-w-[420px]" showCloseButton={false}>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary/10">
            <span className="material-symbols-outlined text-[18px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
              web
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-on-surface truncate">{clienteNome}</p>
            <p className="text-[11px] text-on-surface-variant">Chat do Portal (Clara)</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Lista de sessões / Conversa aberta */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center py-12 text-[13px] text-on-surface-variant/60">
              <span className="material-symbols-outlined animate-spin mr-2 text-[18px]">progress_activity</span>
              Carregando...
            </div>
          )}

          {!loading && conversas.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">forum</span>
              <p className="text-[13px] font-semibold text-on-surface-variant">Nenhuma conversa no portal</p>
              <p className="mt-1 text-[12px] text-on-surface-variant/60">O cliente ainda não conversou com a Clara.</p>
            </div>
          )}

          {!loading && conversas.length > 0 && !conversaAberta && (
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50 px-1 mb-3">
                {conversas.length} sessão{conversas.length > 1 ? 'ões' : ''} registrada{conversas.length > 1 ? 's' : ''}
              </p>
              {conversas.map(c => (
                <button
                  key={c.id}
                  onClick={() => setConversaAberta(c.id)}
                  className="w-full flex items-center gap-3 rounded-xl border border-outline-variant/15 bg-card px-4 py-3 text-left transition-colors hover:bg-surface-container-low/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-on-surface">
                      {formatDateTime(c.criadaEm)}
                    </p>
                    <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                      {c.mensagens.length} mensagens · atualizado {formatDateTime(c.atualizadaEm)}
                    </p>
                    {c.mensagens.length > 0 && (
                      <p className="text-[11px] text-on-surface-variant/50 mt-1 truncate">
                        {c.mensagens[c.mensagens.length - 1].conteudo}
                      </p>
                    )}
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">chevron_right</span>
                </button>
              ))}
            </div>
          )}

          {!loading && conversaAtual && (
            <>
              {/* Sub-header quando tem múltiplas sessões */}
              {conversas.length > 1 && (
                <div className="flex items-center gap-2 border-b border-outline-variant/10 px-4 py-2">
                  <button
                    onClick={() => setConversaAberta(null)}
                    className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                  >
                    <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                    Sessões
                  </button>
                  <span className="text-[11px] text-on-surface-variant/50">·</span>
                  <span className="text-[11px] text-on-surface-variant/60">{formatDateTime(conversaAtual.criadaEm)}</span>
                </div>
              )}

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto space-y-2.5 p-4 bg-surface-container-low/20">
                {conversaAtual.mensagens.length === 0 && (
                  <p className="text-center text-[12px] text-on-surface-variant/50 py-8">
                    Conversa sem mensagens registradas.
                  </p>
                )}
                {conversaAtual.mensagens.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tertiary/10">
                        <span className="material-symbols-outlined text-[12px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
                          smart_toy
                        </span>
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-tertiary text-white rounded-br-md'
                        : 'bg-white text-on-surface rounded-bl-md border border-outline-variant/10'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.conteudo}</p>
                      <p className={`mt-1 text-[10px] ${m.role === 'user' ? 'text-white/50' : 'text-on-surface-variant/40'}`}>
                        {new Date(m.criadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {m.role === 'user' && (
                      <div className="ml-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-container">
                        <span className="material-symbols-outlined text-[12px] text-on-surface-variant">person</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
