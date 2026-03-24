'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = { tarefaId: string }

export function ConcluirTarefaBtn({ tarefaId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleClick() {
    if (done || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/tarefas/${tarefaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'concluida' }),
      })
      if (!res.ok) throw new Error()
      setDone(true)
      toast.success('Tarefa concluída!')
      setTimeout(() => router.refresh(), 400)
    } catch {
      toast.error('Erro ao concluir tarefa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || done}
      aria-label="Concluir tarefa"
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all
        ${done
          ? 'border-green-status bg-green-status'
          : 'border-outline-variant group-hover:border-primary/50 group-hover:bg-primary/5'
        }
        ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {loading && (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border border-primary/30 border-t-primary" />
      )}
      {done && (
        <span className="material-symbols-outlined text-[13px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
      )}
    </button>
  )
}
