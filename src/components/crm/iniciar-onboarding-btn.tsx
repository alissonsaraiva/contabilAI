'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = { leadId: string }

export function IniciarOnboardingBtn({ leadId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funil: 'onboarding', status: 'iniciado', stepAtual: 1 }),
      })
      if (!res.ok) throw new Error()
      toast.success('Lead movido para o Onboarding!')
      router.refresh()
    } catch {
      toast.error('Erro ao iniciar onboarding')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary shadow-sm hover:bg-primary/15 disabled:opacity-60 transition-colors"
    >
      {loading
        ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        : <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
      }
      Iniciar Onboarding
    </button>
  )
}
