'use client'

import { useState } from 'react'
import { toast } from 'sonner'

type Props = {
  clienteId: string
  status: string
}

export function PortalLinkButton({ clienteId, status }: Props) {
  const [loading, setLoading] = useState(false)

  const bloqueado = status === 'suspenso' || status === 'cancelado'

  async function handleClick() {
    if (bloqueado || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/portal-link`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Não foi possível gerar o link do portal.')
        return
      }
      await navigator.clipboard.writeText(data.link)
      toast.success('Link do portal copiado! Válido por 30 minutos.')
    } catch {
      toast.error('Erro ao gerar link do portal.')
    } finally {
      setLoading(false)
    }
  }

  if (bloqueado) return null

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/8 px-3 py-1.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
    >
      <span
        className="material-symbols-outlined text-[15px]"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        {loading ? 'hourglass_empty' : 'open_in_new'}
      </span>
      Portal
    </button>
  )
}
