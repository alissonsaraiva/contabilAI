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
        className="flex items-center gap-1.5 rounded-xl border border-tertiary/30 bg-tertiary/8 px-3 py-1.5 text-[12px] font-semibold text-tertiary transition-colors hover:bg-tertiary/15"
      >
        <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
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
