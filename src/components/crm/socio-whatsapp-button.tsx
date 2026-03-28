'use client'

import { useState } from 'react'
import { WhatsAppDrawer } from './whatsapp-drawer'

type Props = {
  socioId:   string
  socioNome: string
  telefone:  string | null
  whatsapp:  string | null
}

export function SocioWhatsAppButton({ socioId, socioNome, telefone, whatsapp }: Props) {
  const [open, setOpen] = useState(false)

  const temContato = !!(whatsapp || telefone)
  if (!temContato) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-[#25D366]/30 bg-[#25D366]/8 px-3 py-1.5 text-[12px] font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/15"
      >
        <span
          className="material-symbols-outlined text-[15px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          chat_bubble
        </span>
        WhatsApp
      </button>

      <WhatsAppDrawer
        apiPath={`/api/socios/${socioId}/whatsapp`}
        nomeExibido={socioNome}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
