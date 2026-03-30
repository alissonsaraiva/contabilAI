'use client'

import { useState } from 'react'
import { PortalChatDrawer } from './portal-chat-drawer'

type Props = {
  clienteId: string
  clienteNome: string
  status: string
  nomeIa?: string
}

export function PortalChatButton({ clienteId, clienteNome, status, nomeIa = 'Assistente' }: Props) {
  const [open, setOpen] = useState(false)

  if (status === 'suspenso' || status === 'cancelado') return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Ver conversas com ${nomeIa} no Portal`}
        className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-card px-3.5 py-2 text-[13px] font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container hover:border-outline-variant/50"
      >
        <span className="material-symbols-outlined text-[15px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
          web
        </span>
        Chat Portal
      </button>

      <PortalChatDrawer
        clienteId={clienteId}
        clienteNome={clienteNome}
        nomeIa={nomeIa}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
