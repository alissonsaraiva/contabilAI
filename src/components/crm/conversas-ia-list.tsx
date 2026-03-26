'use client'

import { useState } from 'react'
import { formatDateTime } from '@/lib/utils'

const CANAL_ICON: Record<string, string> = {
  whatsapp: 'chat_bubble',
  onboarding: 'chat',
  portal: 'web',
  crm: 'support_agent',
}

const CANAL_COLOR: Record<string, string> = {
  whatsapp: 'bg-[#25D366]/15 text-[#25D366]',
  onboarding: 'bg-primary/10 text-primary',
  portal: 'bg-primary/10 text-primary',
  crm: 'bg-primary/10 text-primary',
}

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  onboarding: 'Site (Onboarding)',
  portal: 'Portal do Cliente',
  crm: 'Atendimento CRM',
}

type Mensagem = {
  id: string
  role: string
  conteudo: string
  criadaEm: Date
}

type Conversa = {
  id: string
  canal: string
  criadaEm: Date
  atualizadaEm: Date
  mensagens: Mensagem[]
}

type Props = { conversas: Conversa[] }

export function ConversasIAList({ conversas }: Props) {
  const [aberta, setAberta] = useState<string | null>(
    conversas.length === 1 ? conversas[0].id : null,
  )

  if (conversas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 py-16 text-center">
        <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">
          forum
        </span>
        <p className="text-sm text-on-surface-variant">Nenhuma conversa registrada</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {conversas.map((c) => {
        const open = aberta === c.id
        const icon = CANAL_ICON[c.canal] ?? 'chat'
        const label = CANAL_LABEL[c.canal] ?? c.canal
        const iconColor = CANAL_COLOR[c.canal] ?? 'bg-primary/10 text-primary'
        const total = c.mensagens.length
        const userMsgs = c.mensagens.filter(m => m.role === 'user').length

        return (
          <div
            key={c.id}
            className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm transition-shadow hover:shadow-md"
          >
            {/* Header */}
            <button
              onClick={() => setAberta(open ? null : c.id)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-container-low/40"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconColor}`}>
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {icon}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-on-surface">{label}</span>
                  <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant">
                    {total} msgs
                  </span>
                  <span className="rounded-full bg-primary/8 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {userMsgs} do cliente
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-on-surface-variant">
                  {formatDateTime(c.criadaEm)} → {formatDateTime(c.atualizadaEm)}
                </p>
              </div>

              <span
                className={`material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant/60 transition-transform ${open ? 'rotate-180' : ''}`}
              >
                expand_more
              </span>
            </button>

            {/* Messages */}
            {open && (
              <div className="border-t border-outline-variant/10 bg-surface-container-low/30 px-4 py-4">
                {total === 0 ? (
                  <p className="text-center text-[12px] text-on-surface-variant/50">
                    Conversa sem mensagens registradas
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                    {c.mensagens.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {m.role === 'assistant' && (
                          <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <span
                              className="material-symbols-outlined text-[12px] text-primary"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              smart_toy
                            </span>
                          </div>
                        )}
                        <div
                          className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                            m.role === 'user'
                              ? 'bg-primary text-white rounded-br-md'
                              : 'bg-white text-on-surface rounded-bl-md border border-outline-variant/10'
                          }`}
                        >
                          <p>{m.conteudo}</p>
                          <p
                            className={`mt-1 text-[10px] ${
                              m.role === 'user' ? 'text-white/50' : 'text-on-surface-variant/40'
                            }`}
                          >
                            {new Date(m.criadaEm).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        {m.role === 'user' && (
                          <div className="ml-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-container">
                            <span className="material-symbols-outlined text-[12px] text-on-surface-variant">
                              person
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
