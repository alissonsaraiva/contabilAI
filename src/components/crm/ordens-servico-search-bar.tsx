'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const STATUS_OPTIONS: [string, string][] = [
  ['aberta',             'Aberta'],
  ['em_andamento',       'Em andamento'],
  ['aguardando_cliente', 'Aguardando'],
  ['resolvida',          'Resolvida'],
  ['cancelada',          'Cancelada'],
]

const STATUS_COLORS: Record<string, string> = {
  aberta:             'text-blue-600 bg-blue-500/10 border-blue-500/30',
  em_andamento:       'text-primary bg-primary/10 border-primary/30',
  aguardando_cliente: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/30',
  resolvida:          'text-green-600 bg-green-500/10 border-green-500/30',
  cancelada:          'text-on-surface-variant/60 bg-surface-container border-outline-variant/30',
}

const TIPO_OPTIONS: [string, string][] = [
  ['duvida',      'Dúvida'],
  ['solicitacao', 'Solicitação'],
  ['reclamacao',  'Reclamação'],
  ['documento',   'Documento'],
  ['outros',      'Outros'],
]

const PRIORIDADE_OPTIONS: [string, string][] = [
  ['baixa',   'Baixa'],
  ['media',   'Média'],
  ['alta',    'Alta'],
  ['urgente', 'Urgente'],
]

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa:   'text-on-surface-variant/60 bg-surface-container border-outline-variant/30',
  media:   'text-blue-600 bg-blue-500/10 border-blue-500/30',
  alta:    'text-yellow-600 bg-yellow-500/10 border-yellow-500/30',
  urgente: 'text-error bg-error/10 border-error/30',
}

export function OrdensServicoSearchBar() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const [q,          setQ]          = useState(searchParams.get('q')          ?? '')
  const [status,     setStatus]     = useState(searchParams.get('status')     ?? '')
  const [tipo,       setTipo]       = useState(searchParams.get('tipo')       ?? '')
  const [prioridade, setPrioridade] = useState(searchParams.get('prioridade') ?? '')

  // Debounce só no texto; filtros de chip navegam imediato
  useEffect(() => {
    const timer = setTimeout(() => push(q, status, tipo, prioridade), q !== (searchParams.get('q') ?? '') ? 400 : 0)
    return () => clearTimeout(timer)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { push(q, status, tipo, prioridade) }, [status, tipo, prioridade]) // eslint-disable-line react-hooks/exhaustive-deps

  function push(q_: string, s: string, t: string, p: string) {
    const params = new URLSearchParams(searchParams.toString())
    q_ ? params.set('q', q_)               : params.delete('q')
    s  ? params.set('status', s)           : params.delete('status')
    t  ? params.set('tipo', t)             : params.delete('tipo')
    p  ? params.set('prioridade', p)       : params.delete('prioridade')
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  function clearAll() {
    setQ('')
    setStatus('')
    setTipo('')
    setPrioridade('')
  }

  const hasFilters = !!q || !!status || !!tipo || !!prioridade

  return (
    <div className="space-y-3">
      {/* Linha 1: input de busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-primary/60">
            search
          </span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por #número, título, cliente ou empresa…"
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-container-low pl-10 pr-9 text-[14px] text-on-surface placeholder:text-on-surface-variant/50 shadow-sm focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

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

      {/* Linha 2: chips de filtro */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">

        {/* Status */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/60 select-none">
            Status
          </span>
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map(([key, label]) => {
              const active = status === key
              const color  = STATUS_COLORS[key] ?? ''
              return (
                <button
                  key={key}
                  onClick={() => setStatus(active ? '' : key)}
                  className={[
                    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-all border',
                    active
                      ? `${color} ring-2 ring-offset-1 ring-current/30`
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface-variant/70 hover:bg-surface-container',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tipo */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/60 select-none">
            Tipo
          </span>
          <div className="flex flex-wrap gap-1">
            {TIPO_OPTIONS.map(([key, label]) => {
              const active = tipo === key
              return (
                <button
                  key={key}
                  onClick={() => setTipo(active ? '' : key)}
                  className={[
                    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-all border',
                    active
                      ? 'text-primary bg-primary/10 border-primary/30 ring-2 ring-offset-1 ring-primary/20'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface-variant/70 hover:bg-surface-container',
                  ].join(' ')}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Prioridade */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/60 select-none">
            Prioridade
          </span>
          <div className="flex flex-wrap gap-1">
            {PRIORIDADE_OPTIONS.map(([key, label]) => {
              const active = prioridade === key
              const color  = PRIORIDADE_COLORS[key] ?? ''
              return (
                <button
                  key={key}
                  onClick={() => setPrioridade(active ? '' : key)}
                  className={[
                    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider transition-all border',
                    active
                      ? `${color} ring-2 ring-offset-1 ring-current/30`
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
