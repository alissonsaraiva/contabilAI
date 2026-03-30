'use client'

import { useEffect, useState, useCallback } from 'react'
import { PROVIDER_LABELS } from '@/lib/ai/constants'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ProviderInfo = {
  name:        string
  ok:          boolean
  checkedAt:   number
  error?:      string
  circuitOpen: boolean
  resetsAt:    number | null
}

type FallbackEvent = {
  id:           number
  fromProvider: string
  toProvider:   string
  feature:      string
  error:        string
  timestamp:    number
}

type ToolStat = { tool: string; count: number; avgMs: number }

type HealthData = {
  providers:      ProviderInfo[]
  fallbackEvents: FallbackEvent[]
  stats: {
    totalAcoes24h: number
    sucessos24h:   number
    taxaSucesso:   number | null
    tools:         ToolStat[]
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  resumirFunil:        'Resumir funil',
  listarLeadsInativos: 'Leads inativos',
  buscarDadosCliente:  'Dados do cliente',
  listarTarefas:       'Listar tarefas',
  criarTarefa:         'Criar tarefa',
  registrarInteracao:  'Registrar interação',
  atualizarStatusLead: 'Atualizar lead',
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60)  return `${diff}s atrás`
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  return `${Math.floor(diff / 3600)}h atrás`
}

function timeUntil(ts: number): string {
  const diff = Math.ceil((ts - Date.now()) / 1000)
  if (diff <= 0) return 'agora'
  if (diff < 60) return `${diff}s`
  return `${Math.ceil(diff / 60)}min`
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function ProviderCard({ p }: { p: ProviderInfo }) {
  const unchecked = p.checkedAt === 0

  const badge = unchecked
    ? { bg: 'bg-zinc-100 dark:bg-zinc-800',  text: 'text-zinc-500',               dot: 'bg-zinc-400',              pulse: false, label: 'Pendente' }
    : p.ok
      ? { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500', pulse: true,  label: 'Online'  }
      : { bg: 'bg-red-50 dark:bg-red-950/40',         text: 'text-red-700 dark:text-red-400',         dot: 'bg-red-500',    pulse: false, label: 'Offline' }

  const cardBorder = unchecked
    ? 'border-zinc-200 dark:border-zinc-700'
    : p.ok
      ? 'border-emerald-200 dark:border-emerald-800'
      : 'border-red-200 dark:border-red-800'

  return (
    <div className={`rounded-2xl border bg-surface-container p-4 space-y-3 ${cardBorder}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-on-surface">
            {PROVIDER_LABELS[p.name] ?? p.name}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {unchecked ? 'Aguardando verificação' : `Verificado ${timeAgo(p.checkedAt)}`}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.bg} ${badge.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot} ${badge.pulse ? 'animate-pulse' : ''}`} />
          {badge.label}
        </span>
      </div>

      {p.circuitOpen && p.resetsAt && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <span className="material-symbols-outlined text-[14px]">electric_bolt</span>
          Circuit aberto — retoma em {timeUntil(p.resetsAt)}
        </div>
      )}

      {!p.ok && p.error && (
        <p className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-400 line-clamp-2">
          {p.error}
        </p>
      )}
    </div>
  )
}

// ─── Card de evento de fallback (expansível) ──────────────────────────────────

function FallbackEventCard({ ev }: { ev: FallbackEvent }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 cursor-pointer select-none"
      onClick={() => setExpanded(v => !v)}
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 mt-0.5 shrink-0">
          electric_bolt
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-on-surface">
            <span className="font-semibold text-red-600 dark:text-red-400">{PROVIDER_LABELS[ev.fromProvider] ?? ev.fromProvider}</span>
            <span className="text-on-surface-variant mx-1.5">→</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">{PROVIDER_LABELS[ev.toProvider] ?? ev.toProvider}</span>
            <span className="ml-2 rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
              {ev.feature}
            </span>
          </p>
          <p className={`text-xs text-on-surface-variant mt-0.5 ${expanded ? 'whitespace-pre-wrap break-all' : 'truncate'}`}>
            {ev.error}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-on-surface-variant whitespace-nowrap">{timeAgo(ev.timestamp)}</span>
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform duration-150" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
            expand_more
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SaudePage() {
  const [data, setData]       = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<number>(0)

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/health')
      if (res.ok) {
        setData(await res.json() as HealthData)
        setLastFetch(Date.now())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const id = setInterval(fetchHealth, 30_000)
    return () => clearInterval(id)
  }, [fetchHealth])

  // Providers que têm API configurada (checkedAt > 0 ou online)
  const activeProviders = data?.providers.filter(p => p.checkedAt > 0 || !p.ok) ?? []
  const allProviders    = data?.providers ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">Saúde das IAs</h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Status em tempo real dos providers e do agente operacional
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch > 0 && (
            <span className="text-xs text-on-surface-variant">
              Atualizado {timeAgo(lastFetch)}
            </span>
          )}
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats 24h */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-surface-container p-4">
            <p className="text-xs text-on-surface-variant mb-1">Ações (24h)</p>
            <p className="text-2xl font-bold text-on-surface">{data.stats.totalAcoes24h}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-surface-container p-4">
            <p className="text-xs text-on-surface-variant mb-1">Taxa de sucesso</p>
            <p className={`text-2xl font-bold ${
              data.stats.taxaSucesso === null                      ? 'text-zinc-400' :
              data.stats.taxaSucesso >= 90                         ? 'text-emerald-600 dark:text-emerald-400' :
              data.stats.taxaSucesso >= 70                         ? 'text-amber-600  dark:text-amber-400'   :
                                                                     'text-red-600    dark:text-red-400'
            }`}>
              {data.stats.taxaSucesso !== null ? `${data.stats.taxaSucesso}%` : '—'}
            </p>
          </div>
          {(() => {
            const fallbacksHoje = data.fallbackEvents.filter(e => Date.now() - e.timestamp < 86400000).length
            return (
              <div className={`rounded-2xl border p-4 ${fallbacksHoje > 0 ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20' : 'border-zinc-200 dark:border-zinc-700 bg-surface-container'}`}>
                <p className="text-xs text-on-surface-variant mb-1">Fallbacks hoje</p>
                <p className={`text-2xl font-bold ${fallbacksHoje > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-on-surface'}`}>
                  {fallbacksHoje}
                </p>
              </div>
            )
          })()}
        </div>
      )}

      {/* Provider cards */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
          Providers
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(allProviders.length > 0 ? allProviders : Array(5).fill(null)).map((p, i) =>
            p ? (
              <ProviderCard key={p.name} p={p} />
            ) : (
              <div key={i} className="h-24 rounded-2xl border border-outline-variant bg-surface-container animate-pulse" />
            )
          )}
        </div>
      </div>

      {/* Tool performance */}
      {data && data.stats.tools.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
            Performance por tool (24h)
          </h2>
          <div className="rounded-2xl border border-outline-variant bg-surface-container overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Tool</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Execuções</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Tempo médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {data.stats.tools.map(t => (
                  <tr key={t.tool} className="hover:bg-surface-container-high/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <span className="material-symbols-outlined text-[13px]">build</span>
                        {TOOL_LABELS[t.tool] ?? t.tool}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-on-surface tabular-nums">{t.count}</td>
                    <td className="px-4 py-3 text-right text-on-surface-variant tabular-nums text-xs">
                      {t.avgMs < 1000 ? `${t.avgMs}ms` : `${(t.avgMs / 1000).toFixed(1)}s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Timeline de fallbacks */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
          Eventos de fallback
        </h2>
        {!data || data.fallbackEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-outline-variant bg-surface-container py-12 text-on-surface-variant">
            <span className="material-symbols-outlined text-[40px] mb-2 opacity-30">check_circle</span>
            <p className="text-sm">Nenhum fallback registrado desde o último restart</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.fallbackEvents.map(ev => (
              <FallbackEventCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
