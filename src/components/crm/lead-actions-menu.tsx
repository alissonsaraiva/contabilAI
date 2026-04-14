'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  leadId: string
  backHref: string
}

export function LeadActionsMenu({ leadId, backHref }: Props) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

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
      ) {
        setOpen(false)
        setConfirming(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/leads/${leadId}`, { method: 'DELETE' })
    router.push(backHref)
    router.refresh()
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-[10px] border border-outline-variant/20 bg-surface-container px-3 py-2 text-[13px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
      >
        <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-[12px] border border-outline-variant/20 bg-card shadow-lg"
        >
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-red-500 transition-colors hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              Apagar lead
            </button>
          ) : (
            <div className="px-4 py-3 space-y-2">
              <p className="text-[12px] text-on-surface-variant">Excluir este lead? Essa ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-lg border border-outline-variant/20 py-1.5 text-[12px] font-medium text-on-surface-variant hover:bg-surface-container"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-red-500 py-1.5 text-[12px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {loading ? 'Apagando...' : 'Apagar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
