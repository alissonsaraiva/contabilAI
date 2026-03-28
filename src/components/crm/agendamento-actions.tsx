'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function AgendamentoToggle({ id, ativo }: { id: string; ativo: boolean }) {
  const [loading, setLoading]   = useState(false)
  const [checked, setChecked]   = useState(ativo)
  const router                  = useRouter()

  async function toggle() {
    setLoading(true)
    try {
      const res = await fetch('/api/agente/agendamentos', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, ativo: !checked }),
      })
      if (!res.ok) throw new Error()
      setChecked(v => !v)
      toast.success(checked ? 'Agendamento pausado' : 'Agendamento ativado')
      router.refresh()
    } catch {
      toast.error('Erro ao alterar agendamento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={checked ? 'Pausar agendamento' : 'Ativar agendamento'}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-outline-variant'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

export function AgendamentoDelete({ id, descricao }: { id: string; descricao: string }) {
  const [loading, setLoading]       = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router                      = useRouter()

  async function remove() {
    setLoading(true)
    try {
      const res = await fetch('/api/agente/agendamentos', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      toast.success('Agendamento removido')
      router.refresh()
    } catch {
      toast.error('Erro ao remover agendamento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); remove() }}
        title="Remover agendamento?"
        description={`"${descricao}" será removido permanentemente.`}
        confirmLabel="Remover"
        loading={loading}
      />
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        title="Remover agendamento"
        className="flex items-center justify-center rounded-lg p-1.5 text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[16px]">delete</span>
      </button>
    </>
  )
}
