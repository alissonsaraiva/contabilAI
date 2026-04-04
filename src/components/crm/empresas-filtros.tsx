'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const REGIMES = [
  { value: 'MEI', label: 'MEI' },
  { value: 'SimplesNacional', label: 'Simples Nacional' },
  { value: 'LucroPresumido', label: 'Lucro Presumido' },
  { value: 'LucroReal', label: 'Lucro Real' },
  { value: 'Autonomo', label: 'Autônomo' },
]

// Filtra por cliente.status — valores válidos do enum StatusCliente
const STATUSES = [
  { value: 'ativo',        label: 'Ativo' },
  { value: 'inadimplente', label: 'Inadimplente' },
  { value: 'suspenso',     label: 'Suspenso' },
  { value: 'cancelado',    label: 'Cancelado' },
]

export function EmpresasFiltros() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentRegime = searchParams.get('regime') ?? ''
  const currentStatus = searchParams.get('status') ?? ''

  const apply = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  const hasFilters = currentRegime || currentStatus

  const clearAll = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('regime')
    params.delete('status')
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Regime */}
      <div className="relative">
        <select
          value={currentRegime}
          onChange={(e) => apply('regime', e.target.value)}
          className={`h-9 rounded-lg border pl-3 pr-8 text-[13px] font-medium shadow-sm appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary/15 ${
            currentRegime
              ? 'border-primary/50 bg-primary/5 text-primary'
              : 'border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-outline-variant/60'
          }`}
        >
          <option value="">Regime</option>
          {REGIMES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/60">
          expand_more
        </span>
      </div>

      {/* Status */}
      <div className="relative">
        <select
          value={currentStatus}
          onChange={(e) => apply('status', e.target.value)}
          className={`h-9 rounded-lg border pl-3 pr-8 text-[13px] font-medium shadow-sm appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-primary/15 ${
            currentStatus
              ? 'border-primary/50 bg-primary/5 text-primary'
              : 'border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:border-outline-variant/60'
          }`}
        >
          <option value="">Status</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant/60">
          expand_more
        </span>
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface-variant/70 hover:text-on-surface hover:border-outline-variant/50 transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
          Limpar
        </button>
      )}
    </div>
  )
}
