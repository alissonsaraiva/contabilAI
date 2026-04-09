'use client'

import { Loader2 } from 'lucide-react'

export function FormActions({
  onCancel, onSubmit, loading,
}: {
  onCancel: () => void
  onSubmit: () => void
  loading: boolean
}) {
  return (
    <div className="flex flex-col-reverse md:flex-row items-center gap-3 w-full md:w-auto">
      <button
        type="button" onClick={onCancel} disabled={loading}
        className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[16px]">undo</span>
        Cancelar
      </button>
      <button
        type="button" onClick={onSubmit} disabled={loading}
        className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 min-w-[140px]"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
        Salvar
      </button>
    </div>
  )
}
