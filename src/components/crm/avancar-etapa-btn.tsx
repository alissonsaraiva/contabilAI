'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = { leadId: string }

export function AvancarEtapaBtn({ leadId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/avancar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error()
      toast.success('Etapa avançada.')
      router.refresh()
    } catch {
      toast.error('Não foi possível avançar a etapa. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      {loading
        ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        : <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>arrow_forward</span>
      }
      Avançar Etapa
    </button>
  )
}
