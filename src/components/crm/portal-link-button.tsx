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
      className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-card px-3.5 py-2 text-[13px] font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container hover:border-outline-variant/50 disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[15px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>
        {loading ? 'hourglass_empty' : 'visibility'}
      </span>
      Inspecionar
    </button>
  )
}
