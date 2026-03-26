'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DevolverIaBtn({ conversaId }: { conversaId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function devolver(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      await fetch(`/api/conversas/${conversaId}/retomar`, { method: 'POST' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={devolver}
      disabled={loading}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
      {loading ? 'Devolvendo...' : 'Devolver para IA'}
    </button>
  )
}
