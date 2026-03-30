'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PLANO_LABELS, PLANO_COLORS, STATUS_CLIENTE_LABELS, STATUS_CLIENTE_COLORS } from '@/types'

const STATUS_OPTIONS = Object.entries(STATUS_CLIENTE_LABELS) as [string, string][]
const PLANO_OPTIONS  = Object.entries(PLANO_LABELS) as [string, string][]

export function ClientesSearchBar() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [value,  setValue]  = useState(searchParams.get('q')      ?? '')
  const [status, setStatus] = useState(searchParams.get('status') ?? '')
  const [plano,  setPlano]  = useState(searchParams.get('plano')  ?? '')

  // Sync URL whenever any filter changes (debounce only on text)
  useEffect(() => {
    const timer = setTimeout(() => push(value, status, plano), value !== (searchParams.get('q') ?? '') ? 400 : 0)
    return () => clearTimeout(timer)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { push(value, status, plano) }, [status, plano]) // eslint-disable-line react-hooks/exhaustive-deps

  function push(q: string, s: string, p: string) {
    const params = new URLSearchParams(searchParams.toString())
    q ? params.set('q', q)      : params.delete('q')
    s ? params.set('status', s) : params.delete('status')
    p ? params.set('plano', p)  : params.delete('plano')
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function clearAll() {
    setValue('')
    setStatus('')
    setPlano('')
  }

  const hasFilters = !!value || !!status || !!plano

  return (
    <div className="space-y-3">
      {/* Linha 1: input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-primary/60">
            search
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Buscar por nome, e-mail, CPF, CNPJ, razão social ou telefone…"
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-container-low pl-10 pr-9 text-[14px] text-on-surface placeholder:text-on-surface-variant/50 shadow-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
          />
          {value && (
            <button
              onClick={() => setValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Limpar tudo */}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low px-3.5 text-[13px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
            <span className="hidden sm:inline">Limpar</span>
          </button>
        )}
      </div>

      {/* Linha 2: filtros rápidos */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {/* Status */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/60 select-none">
            Status
          </span>
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map(([key, label]) => {
              const active = status === key
              const color  = STATUS_CLIENTE_COLORS[key as keyof typeof STATUS_CLIENTE_COLORS] ?? ''
              return (
                <button
                  key={key}
                  onClick={() => setStatus(active ? '' : key)}
                  className={[
                    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-all border',
                    active
                      ? `${color} border-transparent ring-2 ring-offset-1 ring-current/30`
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface-variant/70 hover:bg-surface-container',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Plano */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/60 select-none">
            Plano
          </span>
          <div className="flex flex-wrap gap-1">
            {PLANO_OPTIONS.map(([key, label]) => {
              const active = plano === key
              const color  = PLANO_COLORS[key as keyof typeof PLANO_COLORS] ?? ''
              return (
                <button
                  key={key}
                  onClick={() => setPlano(active ? '' : key)}
                  className={[
                    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-all border',
                    active
                      ? `${color} border-transparent ring-2 ring-offset-1 ring-current/30`
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface-variant/70 hover:bg-surface-container',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
