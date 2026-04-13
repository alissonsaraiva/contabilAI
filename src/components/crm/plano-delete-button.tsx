'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function PlanoDeleteButton({ id }: { id: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/planos/${id}`, { method: 'DELETE' })
      if (res.status === 403) { toast.error('Sem permissão para excluir'); return }
      if (!res.ok) throw new Error()
      toast.success('Plano excluído')
      router.refresh()
    } catch {
      toast.error('Erro ao excluir plano')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); void handleDelete() }}
        title="Excluir plano?"
        description="Esta ação não pode ser desfeita. Clientes associados a este plano não serão afetados."
        confirmLabel="Excluir"
        loading={loading}
      />
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-error hover:opacity-70 transition-opacity disabled:opacity-30"
      >
        <span className="material-symbols-outlined text-[16px]">delete</span>
        Excluir
      </button>
    </>
  )
}
