'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { EditarClienteDrawer, type ClienteEditData } from './editar-cliente-drawer'

type Props = { cliente: ClienteEditData }

export function ClienteActionsMenu({ cliente }: Props) {
  const [open, setOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Posiciona o dropdown usando fixed para escapar de overflow:hidden
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

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="rounded-lg p-1 text-on-surface-variant opacity-0 transition-opacity hover:text-on-surface group-hover:opacity-100"
      >
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-[12px] border border-outline-variant/20 bg-card shadow-lg"
        >
          {/* Ver detalhes */}
          <Link
            href={`/crm/clientes/${cliente.id}`}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
            onClick={() => setOpen(false)}
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">open_in_new</span>
            Ver detalhes
          </Link>

          {/* Editar */}
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); setEditOpen(true) }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
            Editar cliente
          </button>

        </div>
      )}

      <EditarClienteDrawer
        cliente={cliente}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </>
  )
}
