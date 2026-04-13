'use client'

import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

type Empresa = { id: string; label: string }

type Props = {
  empresas: Empresa[]
  empresaAtiva: string
}

export function EmpresaSelector({ empresas, empresaAtiva }: Props) {
  const pathname = usePathname()
  const [isPending, setIsPending] = useState(false)
  const [value, setValue] = useState(empresaAtiva)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  if (empresas.length <= 1) return null

  const labelAtivo = empresas.find(e => e.id === value)?.label ?? value

  async function trocar(novaId: string) {
    if (novaId === value || isPending) { setOpen(false); return }
    const anterior = value
    setValue(novaId)
    setOpen(false)
    setIsPending(true)
    try {
      const res = await fetch('/api/portal/empresa/trocar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId: novaId }),
      })
      if (res.ok) {
        // Navegação completa: garante que o layout e todas as páginas re-executem
        // no servidor com o novo cookie (router.refresh() não invalida o RSC cache
        // de forma confiável após a segunda chamada em App Router)
        window.location.assign(pathname)
      } else {
        setValue(anterior)
        setIsPending(false)
      }
    } catch (err) {
      console.error('[empresa-selector] Erro ao trocar empresa:', err)
      setValue(anterior)
      setIsPending(false)
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      {/* Label de contexto */}
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
        Empresa ativa
      </p>

      {/* Botão trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[13px] font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-50"
      >
        <span
          className="material-symbols-outlined shrink-0 text-[17px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          domain
        </span>
        <span className="max-w-[260px] truncate">{labelAtivo}</span>
        <span
          className="material-symbols-outlined shrink-0 text-[17px] text-on-surface-variant/50 transition-transform"
          style={{
            fontVariationSettings: "'FILL' 0, 'wght' 300",
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          expand_more
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[280px] rounded-xl border border-outline-variant/20 bg-surface-container shadow-lg ring-1 ring-black/5">
          <div className="flex items-center gap-2 border-b border-outline-variant/15 px-3 py-2.5">
            <span
              className="material-symbols-outlined text-[15px] text-on-surface-variant/50"
              style={{ fontVariationSettings: "'FILL' 0" }}
            >
              swap_horiz
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Trocar empresa
            </p>
          </div>
          <ul className="py-1">
            {empresas.map((emp) => {
              const isActive = emp.id === value
              return (
                <li key={emp.id}>
                  <button
                    onClick={() => trocar(emp.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-primary/5"
                  >
                    <span
                      className={`material-symbols-outlined shrink-0 text-[16px] ${isActive ? 'text-primary' : 'text-transparent'}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      check_circle
                    </span>
                    <span className={`truncate ${isActive ? 'font-semibold text-primary' : 'text-on-surface'}`}>
                      {emp.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
