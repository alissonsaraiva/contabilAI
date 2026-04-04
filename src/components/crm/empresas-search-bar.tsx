'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { STATUS_CLIENTE_LABELS, STATUS_CLIENTE_COLORS } from '@/types'

const REGIME_LABELS: Record<string, string> = {
  MEI: 'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido: 'Lucro Presumido',
  LucroReal: 'Lucro Real',
  Autonomo: 'Autônomo',
}

const REGIME_COLORS: Record<string, string> = {
  MEI: 'text-green-status bg-green-status/10',
  SimplesNacional: 'text-primary bg-primary/10',
  LucroPresumido: 'text-tertiary bg-tertiary/10',
  LucroReal: 'text-orange-status bg-orange-status/10',
  Autonomo: 'text-on-surface-variant bg-surface-container',
}

const STATUS_OPTIONS = Object.entries(STATUS_CLIENTE_LABELS) as [string, string][]
const REGIME_OPTIONS = Object.entries(REGIME_LABELS) as [string, string][]

export function EmpresasSearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const [status, setStatus] = useState(searchParams.get('status') ?? '')
  const [regime, setRegime] = useState(searchParams.get('regime') ?? '')

  useEffect(() => {
    const timer = setTimeout(() => push(value, status, regime), value !== (searchParams.get('q') ?? '') ? 400 : 0)
    return () => clearTimeout(timer)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { push(value, status, regime) }, [status, regime]) // eslint-disable-line react-hooks/exhaustive-deps

  function push(q: string, s: string, r: string) {
    const params = new URLSearchParams(searchParams.toString())
    q ? params.set('q', q) : params.delete('q')
    s ? params.set('status', s) : params.delete('status')
    r ? params.set('regime', r) : params.delete('regime')
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function clearAll() {
    setValue('')
    setStatus('')
    setRegime('')
  }

  const hasFilters = !!value || !!status || !!regime

  return (
    <div className="flex flex-col gap-4">
      {/* Search input - Sleek and minimalistic */}
      <div className="flex w-full gap-3">
        <div className="group relative flex-1">
          <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant/40 transition-colors group-focus-within:text-primary">
            search
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou titular…"
            className="h-12 w-full rounded-2xl border border-transparent bg-surface-container-lowest/80 pl-11 pr-10 text-[14px] font-medium text-on-surface shadow-sm placeholder:text-on-surface-variant/40 transition-all hover:bg-surface-container-lowest focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/5"
          />
          {value && (
            <button
              onClick={() => setValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant/40 transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="flex h-12 w-12 sm:w-auto items-center justify-center gap-1.5 rounded-2xl border border-outline-variant/15 bg-card px-0 sm:px-4 text-[13px] font-semibold tracking-wide text-on-surface-variant shadow-sm transition-all hover:border-outline-variant/30 hover:bg-surface-container-lowest hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">filter_list_off</span>
            <span className="hidden sm:inline">Limpar filtros</span>
          </button>
        )}
      </div>

      {/* Segmented Controls */}
      <div className="flex flex-wrap gap-4">
        {/* Status */}
        <div className="flex w-full overflow-x-auto custom-scrollbar sm:w-auto items-center rounded-2xl bg-surface-container-lowest/80 p-1 border border-outline-variant/10 shadow-sm">
          <button
            onClick={() => setStatus('')}
            className={[
              'shrink-0 rounded-xl px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-all',
              !status
                ? 'bg-card text-on-surface shadow-sm ring-1 ring-outline-variant/5'
                : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low/50',
            ].join(' ')}
          >
            Todos os status
          </button>

          {STATUS_OPTIONS.map(([key, label]) => {
            const active = status === key
            const color = STATUS_CLIENTE_COLORS[key as keyof typeof STATUS_CLIENTE_COLORS]?.split(' ').slice(0, 2).join(' ') ?? ''
            return (
              <button
                key={key}
                onClick={() => setStatus(active ? '' : key)}
                className={[
                  'shrink-0 rounded-xl px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-all border',
                  active
                    ? `${color} shadow-sm ring-1 ring-outline-variant/5 border-transparent`
                    : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low/50 border-transparent',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Regime */}
        <div className="flex w-full overflow-x-auto custom-scrollbar sm:w-auto items-center rounded-2xl bg-surface-container-lowest/80 p-1 border border-outline-variant/10 shadow-sm">
          <button
            onClick={() => setRegime('')}
            className={[
              'shrink-0 rounded-xl px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-all',
              !regime
                ? 'bg-card text-on-surface shadow-sm ring-1 ring-outline-variant/5'
                : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low/50',
            ].join(' ')}
          >
            Todos os regimes
          </button>

          {REGIME_OPTIONS.map(([key, label]) => {
            const active = regime === key
            const color = REGIME_COLORS[key]?.split(' ').slice(0, 2).join(' ') ?? ''
            return (
              <button
                key={key}
                onClick={() => setRegime(active ? '' : key)}
                className={[
                  'shrink-0 rounded-xl px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-all border',
                  active
                    ? `${color} shadow-sm ring-1 ring-outline-variant/5 border-transparent`
                    : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low/50 border-transparent',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
