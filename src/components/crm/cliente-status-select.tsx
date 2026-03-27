'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { StatusCliente } from '@prisma/client'
import { STATUS_CLIENTE_LABELS, STATUS_CLIENTE_COLORS } from '@/types'

const ALL_STATUSES: StatusCliente[] = ['ativo', 'inadimplente', 'suspenso', 'cancelado', 'encerrado']

export function ClienteStatusSelect({
  clienteId,
  status,
}: {
  clienteId: string
  status: StatusCliente
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function changeStatus(newStatus: StatusCliente) {
    if (newStatus === status) { setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/clientes/${clienteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success('Status atualizado')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar status')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80 disabled:opacity-50 ${STATUS_CLIENTE_COLORS[status]}`}
      >
        {loading ? (
          <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current/30 border-t-current" />
        ) : null}
        {STATUS_CLIENTE_LABELS[status]}
        <span className="material-symbols-outlined text-[13px]">expand_more</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 min-w-[150px] overflow-hidden rounded-[10px] border border-outline-variant/20 bg-card shadow-lg">
          {ALL_STATUSES.filter((s) => s !== status).map((s) => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-[12px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
            >
              <span
                className={`h-2 w-2 rounded-full ${STATUS_CLIENTE_COLORS[s]?.split(' ')[0]}`}
              />
              {STATUS_CLIENTE_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
