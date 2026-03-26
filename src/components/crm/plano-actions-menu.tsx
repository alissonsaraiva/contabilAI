'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { PlanoTipo } from '@prisma/client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type Plano = { id: string; tipo: PlanoTipo; ativo: boolean; destaque: boolean }
type Props = { plano: Plano }

export function PlanoActionsMenu({ plano }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation()
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen(v => !v)
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function patch(data: Record<string, unknown>, msg: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/planos/${plano.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      toast.success(msg)
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar plano')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/planos/${plano.id}`, { method: 'DELETE' })
      if (res.status === 403) { toast.error('Sem permissão'); return }
      if (!res.ok) throw new Error()
      toast.success('Plano excluído')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao excluir plano')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={loading}
        className="rounded-lg p-1 text-on-surface-variant opacity-0 transition-opacity hover:text-on-surface group-hover:opacity-100 disabled:opacity-30"
      >
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); handleDelete() }}
        title="Excluir plano?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={loading}
      />

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-[190px] overflow-hidden rounded-[12px] border border-outline-variant/20 bg-card shadow-lg"
        >
          <button
            onClick={() => patch({ destaque: !plano.destaque }, plano.destaque ? 'Destaque removido' : 'Plano em destaque!')}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: plano.destaque ? "'FILL' 1" : "'FILL' 0" }}>star</span>
            {plano.destaque ? 'Remover destaque' : 'Marcar como destaque'}
          </button>

          <button
            onClick={() => patch({ ativo: !plano.ativo }, plano.ativo ? 'Plano desativado' : 'Plano ativado')}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
              {plano.ativo ? 'visibility_off' : 'visibility'}
            </span>
            {plano.ativo ? 'Desativar plano' : 'Ativar plano'}
          </button>

          <div className="mx-3 my-1 border-t border-outline-variant/15" />

          <button
            onClick={() => setConfirmOpen(true)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-error transition-colors hover:bg-error/5"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Excluir plano
          </button>
        </div>
      )}
    </>
  )
}
