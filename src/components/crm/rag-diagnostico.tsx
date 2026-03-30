'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type CanalRAG = 'onboarding' | 'crm' | 'portal' | 'whatsapp' | 'geral'

type ResultadoChunk = {
  id:         string
  tipo:       string
  titulo:     string | null
  similarity: number
  preview:    string
  escopo:     string
}

type AvaliacaoResult = {
  query:          string
  canal:          string
  performanceMs:  { embedding: number; total: number }
  semantico:      { total: number; resultados: ResultadoChunk[] }
  hibrido:        { total: number; resultados: ResultadoChunk[] }
  analise: {
    totalUnicos:         number
    sobreposicao:        number
    exclusivosSemantico: number
    exclusivosHibrido:   number
    ganhoHibrido:        number
    recomendacao:        string
  }
}

const CANAIS: { value: CanalRAG; label: string }[] = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'crm',        label: 'CRM' },
  { value: 'portal',     label: 'Portal' },
  { value: 'whatsapp',   label: 'WhatsApp' },
  { value: 'geral',      label: 'Geral' },
]

const INPUT = 'w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'

function SimilarityBadge({ value, exclusive }: { value: number; exclusive?: boolean }) {
  const pct   = Math.round(value * 100)
  const color = value >= 0.8
    ? 'bg-green-status/10 text-green-status'
    : value >= 0.6
      ? 'bg-amber-400/10 text-amber-600'
      : 'bg-surface-container text-on-surface-variant'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${color} ${exclusive ? 'ring-1 ring-primary/30' : ''}`}>
      {pct}%
      {exclusive && <span className="text-[9px] font-normal opacity-70">excl.</span>}
    </span>
  )
}

function ChunkCard({ chunk, isExclusive }: { chunk: ResultadoChunk; isExclusive: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border p-3 transition-colors',
      isExclusive
        ? 'border-primary/20 bg-primary/[0.03]'
        : 'border-outline-variant/15 bg-surface-container-low/50',
    )}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <SimilarityBadge value={chunk.similarity} exclusive={isExclusive} />
        {isExclusive && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-primary/70">exclusivo</span>
        )}
      </div>
      {chunk.titulo && (
        <p className="text-[12px] font-semibold text-on-surface truncate">{chunk.titulo}</p>
      )}
      <p className="text-[11px] text-on-surface-variant/70 leading-relaxed line-clamp-3 mt-0.5">
        {chunk.preview}
      </p>
      <div className="flex gap-2 mt-1.5 flex-wrap">
        <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] text-on-surface-variant/40">{chunk.tipo}</span>
        <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] text-on-surface-variant/40">{chunk.escopo}</span>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function RagDiagnostico() {
  const [open,      setOpen]      = useState(false)
  const [query,     setQuery]     = useState('')
  const [canal,     setCanal]     = useState<CanalRAG>('crm')
  const [clienteId, setClienteId] = useState('')
  const [limite,    setLimite]    = useState('10')
  const [loading,   setLoading]   = useState(false)
  const [resultado, setResultado] = useState<AvaliacaoResult | null>(null)
  const [erro,      setErro]      = useState<string | null>(null)

  async function handleAvaliar() {
    if (!query.trim()) return
    setLoading(true)
    setErro(null)
    setResultado(null)
    try {
      const params = new URLSearchParams({ q: query.trim(), canal, limite })
      if (clienteId.trim()) params.set('clienteId', clienteId.trim())
      const res  = await fetch(`/api/rag/avaliar?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao avaliar')
      setResultado(data)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const idsHibrido   = new Set(resultado?.hibrido.resultados.map(r => r.id) ?? [])
  const idsSemantico = new Set(resultado?.semantico.resultados.map(r => r.id) ?? [])

  return (
    <div className="rounded-[14px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">

      {/* Header accordion */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-surface-container-low/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/8">
            <span className="material-symbols-outlined text-[16px] text-primary/70">biotech</span>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-on-surface">Diagnóstico RAG</p>
            <p className="text-[12px] text-on-surface-variant/70">Compare busca semântica vs híbrida (BM25 + vetor) para uma query</p>
          </div>
        </div>
        <span className={`material-symbols-outlined text-[18px] text-on-surface-variant/50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="border-t border-outline-variant/10 px-5 pb-6 pt-4 space-y-4">

          {/* Formulário */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAvaliar() }}
                className={INPUT}
                placeholder="Ex: prazo DAS MEI 2025, CNPJ empresa…"
              />
            </div>
            <select
              value={canal}
              onChange={e => setCanal(e.target.value as CanalRAG)}
              className={`${INPUT} w-36 cursor-pointer`}
            >
              {CANAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <input
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              className={`${INPUT} w-44`}
              placeholder="clienteId (opcional)"
            />
            <select
              value={limite}
              onChange={e => setLimite(e.target.value)}
              className={`${INPUT} w-28 cursor-pointer`}
            >
              {['5', '10', '15', '20'].map(v => (
                <option key={v} value={v}>{v} chunks</option>
              ))}
            </select>
            <button
              onClick={handleAvaliar}
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              }
              {loading ? 'Avaliando...' : 'Avaliar'}
            </button>
          </div>

          {/* Erro */}
          {erro && (
            <div className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-[13px] text-error">
              {erro}
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div className="space-y-4">

              {/* Sumário */}
              <div className={cn(
                'rounded-xl border px-4 py-3 space-y-2',
                resultado.analise.ganhoHibrido > 0
                  ? 'border-primary/20 bg-primary/5'
                  : 'border-outline-variant/15 bg-surface-container-low/50',
              )}>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
                  <span className="font-semibold text-on-surface">
                    {resultado.analise.totalUnicos} chunk{resultado.analise.totalUnicos !== 1 ? 's' : ''} únicos
                  </span>
                  <span className="text-on-surface-variant">
                    {resultado.analise.sobreposicao} em ambos
                  </span>
                  <span className="text-on-surface-variant">
                    {resultado.analise.exclusivosSemantico} só semântico
                  </span>
                  {resultado.analise.ganhoHibrido > 0 && (
                    <span className="font-semibold text-primary">
                      +{resultado.analise.ganhoHibrido} só híbrido (ganho BM25)
                    </span>
                  )}
                  <span className="ml-auto text-on-surface-variant/50 tabular-nums">
                    ⚡ {resultado.performanceMs.total}ms · embed {resultado.performanceMs.embedding}ms
                  </span>
                </div>
                <p className="text-[12px] text-on-surface-variant">{resultado.analise.recomendacao}</p>
              </div>

              {/* Colunas side-by-side */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                {/* Semântico */}
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">
                    Semântico · {resultado.semantico.total} resultado{resultado.semantico.total !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-2">
                    {resultado.semantico.resultados.length === 0 ? (
                      <p className="text-[12px] italic text-on-surface-variant/50">Nenhum resultado</p>
                    ) : resultado.semantico.resultados.map(r => (
                      <ChunkCard
                        key={r.id}
                        chunk={r}
                        isExclusive={!idsHibrido.has(r.id)}
                      />
                    ))}
                  </div>
                </div>

                {/* Híbrido */}
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">
                    Híbrido BM25 + semântico · {resultado.hibrido.total} resultado{resultado.hibrido.total !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-2">
                    {resultado.hibrido.resultados.length === 0 ? (
                      <p className="text-[12px] italic text-on-surface-variant/50">Nenhum resultado</p>
                    ) : resultado.hibrido.resultados.map(r => (
                      <ChunkCard
                        key={r.id}
                        chunk={r}
                        isExclusive={!idsSemantico.has(r.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
