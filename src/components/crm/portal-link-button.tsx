'use client'

import { useState } from 'react'
import { toast } from 'sonner'

type Props = {
  clienteId: string
  status: string
}

export function PortalLinkButton({ clienteId, status }: Props) {
  const [loading, setLoading] = useState(false)

  if (status === 'suspenso' || status === 'cancelado') return null

  async function handleInspecionar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/portal-link`, { method: 'POST' })
      if (!res.ok) { toast.error('Não foi possível abrir o portal.'); return }
      const data = await res.json() as { link?: string }
      if (!data.link) { toast.error('Link inválido.'); return }
      window.open(data.link, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Erro ao abrir o portal.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleInspecionar}
      disabled={loading}
      title="Ver portal como o cliente (modo inspeção)"
      className="flex items-center gap-1.5 rounded-xl border border-tertiary/30 bg-tertiary/8 px-3 py-1.5 text-[12px] font-semibold text-tertiary transition-colors hover:bg-tertiary/15 disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
        {loading ? 'hourglass_empty' : 'visibility'}
      </span>
      Inspecionar
    </button>
  )
}
