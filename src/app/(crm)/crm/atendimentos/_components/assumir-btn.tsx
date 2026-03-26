'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AssumiirBtn({ conversaId }: { conversaId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function assumir(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      await fetch('/api/conversas/pausar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaId }),
      })
      router.push(`/crm/atendimentos/conversa/${conversaId}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={(e) => assumir(e)}
      disabled={loading}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[14px]">support_agent</span>
      {loading ? 'Assumindo...' : 'Assumir controle'}
    </button>
  )
}
