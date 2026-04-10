'use client'

import { useState } from 'react'
import { toast } from 'sonner'

const MAX_CONCURRENT = 5

type Props = {
  selectedIds: Set<string>
  totalFiltered: number
  onSelectAll: () => void
  onClearSelection: () => void
  onDeleted: (deletedIds: string[]) => void
  onBulkUpdated: (updatedIds: string[], patch: Record<string, unknown>) => void
}

async function batchRequest(
  ids: string[],
  fn: (id: string) => Promise<boolean>,
): Promise<{ succeeded: string[]; failed: string[] }> {
  const succeeded: string[] = []
  const failed: string[] = []
  for (let i = 0; i < ids.length; i += MAX_CONCURRENT) {
    const batch = ids.slice(i, i + MAX_CONCURRENT)
    const results = await Promise.all(
      batch.map(async id => ({ id, ok: await fn(id) })),
    )
    for (const r of results) {
      if (r.ok) succeeded.push(r.id); else failed.push(r.id)
    }
  }
  return { succeeded, failed }
}

export function DocumentoBulkActions({
  selectedIds, totalFiltered,
  onSelectAll, onClearSelection,
  onDeleted, onBulkUpdated,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [confirmandoDelete, setConfirmandoDelete] = useState(false)
  const count = selectedIds.size

  if (count === 0) return null

  async function handleBulkDelete() {
    const ids = [...selectedIds]
    setLoading(true)
    const { succeeded, failed } = await batchRequest(ids, async id => {
      try {
        const res = await fetch(`/api/crm/documentos/${id}`, { method: 'DELETE' })
        return res.ok
      } catch { return false }
    })
    setLoading(false)
    setConfirmandoDelete(false)
    onDeleted(succeeded)
    if (failed.length === 0) {
      toast.success(`${succeeded.length} documento${succeeded.length !== 1 ? 's' : ''} removido${succeeded.length !== 1 ? 's' : ''}`)
    } else {
      toast.error(`${failed.length} falharam ao remover`)
    }
  }

  async function handleBulkVisibility(visivelPortal: boolean) {
    const ids = [...selectedIds]
    setLoading(true)
    const { succeeded, failed } = await batchRequest(ids, async id => {
      try {
        const res = await fetch(`/api/crm/documentos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visivelPortal }),
        })
        return res.ok
      } catch { return false }
    })
    setLoading(false)
    if (succeeded.length > 0) {
      onBulkUpdated(succeeded, { visivelPortal })
    }
    const label = visivelPortal ? 'disponibilizado' : 'ocultado'
    if (failed.length === 0) {
      toast.success(`${succeeded.length} documento${succeeded.length !== 1 ? 's' : ''} ${label}${succeeded.length !== 1 ? 's' : ''}`)
    } else {
      toast.error(`${failed.length} falharam ao atualizar`)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-primary/5 border border-primary/15 px-4 py-2.5">
      {/* Contador */}
      <span className="text-[13px] font-semibold text-primary">
        {count} selecionado{count !== 1 ? 's' : ''}
      </span>

      <div className="h-4 w-px bg-primary/20" />

      {/* Seleção */}
      <button
        onClick={onSelectAll}
        className="text-[12px] font-semibold text-primary/80 hover:text-primary transition-colors"
      >
        Selecionar todos ({totalFiltered})
      </button>
      <button
        onClick={() => { onClearSelection(); setConfirmandoDelete(false) }}
        className="text-[12px] font-semibold text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
      >
        Limpar
      </button>

      <div className="flex-1" />

      {/* Ações de visibilidade */}
      <button
        onClick={() => handleBulkVisibility(true)}
        disabled={loading}
        className="flex items-center gap-1 rounded-lg bg-surface-container px-2.5 py-1.5 text-[12px] font-semibold text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
        title="Disponibilizar no portal"
      >
        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>visibility</span>
        Portal
      </button>
      <button
        onClick={() => handleBulkVisibility(false)}
        disabled={loading}
        className="flex items-center gap-1 rounded-lg bg-surface-container px-2.5 py-1.5 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
        title="Tornar interno"
      >
        <span className="material-symbols-outlined text-[14px]">visibility_off</span>
        Interno
      </button>

      {/* Delete */}
      {confirmandoDelete ? (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-error font-medium">Confirmar?</span>
          <button
            onClick={handleBulkDelete}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-error px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-error/90 transition-colors disabled:opacity-50"
          >
            {loading
              ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : <span className="material-symbols-outlined text-[14px]">delete</span>
            }
            {loading ? 'Removendo...' : `Sim, excluir ${count}`}
          </button>
          <button
            onClick={() => setConfirmandoDelete(false)}
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-on-surface-variant/60 hover:bg-surface-container transition-colors"
          >
            Não
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmandoDelete(true)}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-error/10 px-3 py-1.5 text-[12px] font-semibold text-error hover:bg-error/20 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
          Excluir {count}
        </button>
      )}
    </div>
  )
}
