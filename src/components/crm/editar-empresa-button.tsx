'use client'

import { useState } from 'react'
import { EditarEmpresaDrawer, type EmpresaEditData } from './editar-empresa-drawer'

export function EditarEmpresaButton({ empresa }: { empresa: EmpresaEditData }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-card px-3 py-2 text-[13px] font-semibold text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[15px]">edit</span>
        Editar empresa
      </button>
      <EditarEmpresaDrawer empresa={empresa} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
