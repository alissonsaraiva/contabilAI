'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const STATUS_OPTIONS: [string, string][] = [
  ['aberta', 'Aberta'],
  ['em_andamento', 'Em andamento'],
  ['aguardando_cliente', 'Aguardando'],
  ['resolvida', 'Resolvida'],
  ['cancelada', 'Cancelada'],
]

const STATUS_COLORS: Record<string, string> = {
  aberta: 'text-blue-600 bg-blue-500/10 border-blue-500/30',
  em_andamento: 'text-primary bg-primary/10 border-primary/30',
  aguardando_cliente: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/30',
  resolvida: 'text-green-600 bg-green-500/10 border-green-500/30',
  cancelada: 'text-on-surface-variant/60 bg-surface-container border-outline-variant/30',
}

export function ChamadosSearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [status, setStatus] = useState(searchParams.get('status') ?? '')

  // Debounce só no texto; filtros de chip navegam imediato
  useEffect(() => {
    const timer = setTimeout(() => push(q, status), q !== (searchParams.get('q') ?? '') ? 400 : 0)
    return () => clearTimeout(timer)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { push(q, status) }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  function push(q_: string, s: string) {
    const params = new URLSearchParams(searchParams.toString())
    q_ ? params.set('q', q_) : params.delete('q')
    s ? params.set('status', s) : params.delete('status')
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function clearAll() {
    setQ('')
    setStatus('')
  }

  const hasFilters = !!q || !!status

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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por #número, título, cliente ou empresa…"
            className="h-12 w-full rounded-2xl border border-transparent bg-surface-container-lowest/80 pl-11 pr-10 text-[14px] font-medium text-on-surface shadow-sm placeholder:text-on-surface-variant/40 transition-all hover:bg-surface-container-lowest focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/5"
          />
          {q && (
            <button
              onClick={() => setQ('')}
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

      {/* Segmented Control Filter */}
      <div className="flex w-full overflow-x-auto custom-scrollbar items-center rounded-2xl bg-surface-container-lowest/80 p-1 border border-outline-variant/10 shadow-sm">
        <button
          onClick={() => setStatus('')}
          className={[
            'shrink-0 rounded-xl px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-all',
            !status
              ? 'bg-card text-on-surface shadow-sm ring-1 ring-outline-variant/5'
              : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low/50',
          ].join(' ')}
        >
          Todos
        </button>

        {STATUS_OPTIONS.map(([key, label]) => {
          const active = status === key
          const colorBase = STATUS_COLORS[key]?.split(' ').slice(0, 2).join(' ') ?? ''
          return (
            <button
              key={key}
              onClick={() => setStatus(active ? '' : key)}
              className={[
                'shrink-0 rounded-xl px-4 py-2 text-[10px] font-extrabold uppercase tracking-widest transition-all',
                active
                  ? `${colorBase} shadow-sm ring-1 ring-outline-variant/5`
                  : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low/50 border border-transparent',
              ].join(' ')}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
