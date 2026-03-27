'use client'

import { useState } from 'react'
import { EditarClienteDrawer, type ClienteEditData } from './editar-cliente-drawer'

type Props = { cliente: ClienteEditData }

export function EditarClienteButton({ cliente }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-card px-3.5 py-2 text-[13px] font-medium text-on-surface shadow-sm transition-all hover:bg-surface-container hover:border-outline-variant/50"
      >
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
        Editar
      </button>

      <EditarClienteDrawer
        cliente={cliente}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
