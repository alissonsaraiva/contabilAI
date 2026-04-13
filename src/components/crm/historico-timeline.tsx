'use client'

import { useState, useEffect, useCallback } from 'react'
import { getEventoConfig } from '@/lib/historico-config'
import { formatDateTime } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type InteracaoItem = {
  id: string
  tipo: string
  origem: string
  titulo: string | null
  conteudo: string | null
  metadados: Record<string, unknown> | null
  criadoEm: string
  usuario: { nome: string; avatar: string | null } | null
}

type HistoricoResponse = {
  itens: InteracaoItem[]
  total: number
  page: number
  pages: number
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type HistoricoTimelineProps = {
  // Contexto — pelo menos um deve ser fornecido (ou global=true)
  clienteId?: string
  leadId?: string
  usuarioId?: string
  global?: boolean

  // Filtros pré-fixados (quando definidos, ocultam o seletor correspondente)
  origemFixa?: 'usuario' | 'ia' | 'agente' | 'sistema'

  // UI
  mostrarFiltros?: boolean  // default: true
  compact?: boolean         // versão sem filtros para uso em sidebars/widgets
  limitInicial?: number     // default: 15

  // Nome para a IA nos eventos de email_recebido (sugestão da IA)
  nomeIa?: string
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function HistoricoTimeline({
  clienteId,
  leadId,
  usuarioId,
  global: isGlobal,
  origemFixa,
  mostrarFiltros = true,
  compact = false,
  limitInicial = 15,
  nomeIa = 'Assistente',
}: HistoricoTimelineProps) {
  const [itens, setItens]     = useState<InteracaoItem[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [origem, setOrigem]   = useState(origemFixa ?? '')

  function buildUrl(p: number) {
    const params = new URLSearchParams()
    if (clienteId) params.set('clienteId', clienteId)
    if (leadId)    params.set('leadId',    leadId)
    if (usuarioId) params.set('usuarioId', usuarioId)
    if (isGlobal)  params.set('global',    'true')
    if (origem)    params.set('origem',    origem)
    params.set('page',  String(p))
    params.set('limit', String(limitInicial))
    return `/api/historico?${params}`
  }

  const carregarPrimeiro = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(buildUrl(1))
      if (!res.ok) return
      const data: HistoricoResponse = await res.json()
      setItens(data.itens)
      setTotal(data.total)
      setPage(1)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, leadId, usuarioId, origem, isGlobal])

  useEffect(() => {
    void carregarPrimeiro()
  }, [carregarPrimeiro])

  async function carregarMais() {
    const nextPage = page + 1
    const res = await fetch(buildUrl(nextPage))
    if (!res.ok) return
    const data: HistoricoResponse = await res.json()
    setItens(prev => [...prev, ...data.itens])
    setPage(nextPage)
  }

  const temMais = itens.length < total

  return (
    <div className="space-y-4">
      {/* Filtros */}
      {mostrarFiltros && !compact && !origemFixa && (
        <div className="flex items-center gap-2">
          <select
            value={origem}
            onChange={e => setOrigem(e.target.value)}
            className="rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Todas as origens</option>
            <option value="usuario">Usuário</option>
            <option value="ia">IA</option>
            <option value="agente">Agente</option>
            <option value="sistema">Sistema</option>
          </select>
          {!loading && (
            <span className="text-xs text-on-surface-variant">
              {total} {total === 1 ? 'registro' : 'registros'}
            </span>
          )}
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-8 w-8 shrink-0 rounded-full bg-surface-container animate-pulse" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-3/4 rounded bg-surface-container animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-surface-container animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vazio */}
      {!loading && itens.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 py-12 text-center">
          <span
            className="material-symbols-outlined mb-3 text-[36px] text-on-surface-variant/25"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            history
          </span>
          <p className="text-sm text-on-surface-variant">Nenhuma atividade registrada</p>
        </div>
      )}

      {/* Timeline */}
      {!loading && itens.length > 0 && (
        <div className="space-y-0">
          {itens.map((item, idx) => (
            <TimelineItem
              key={item.id}
              item={item}
              isFirst={idx === 0}
              isLast={idx === itens.length - 1 && !temMais}
              nomeIa={nomeIa}
            />
          ))}
        </div>
      )}

      {/* Carregar mais */}
      {temMais && !loading && (
        <button
          onClick={carregarMais}
          className="text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
        >
          Carregar mais ({total - itens.length} restantes)
        </button>
      )}
    </div>
  )
}

// ─── Item da timeline ─────────────────────────────────────────────────────────

function TimelineItem({
  item,
  isFirst,
  isLast,
  nomeIa,
}: {
  item: InteracaoItem
  isFirst: boolean
  isLast: boolean
  nomeIa: string
}) {
  const config = getEventoConfig(item.tipo)

  return (
    <div className="flex gap-4">
      {/* Dot + linha conectora */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isFirst
              ? 'bg-primary text-white'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[15px] ${isFirst ? '' : (config.cor ?? '')}`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {config.icon}
          </span>
        </div>
        {!isLast && (
          <div className="mt-1 w-px flex-1 min-h-[1.5rem] bg-outline-variant/30" />
        )}
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1 pb-5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-on-surface">
            {item.titulo ?? config.label}
          </p>
          <span className="shrink-0 text-xs text-on-surface-variant whitespace-nowrap">
            {formatDateTime(new Date(item.criadoEm))}
          </span>
        </div>

        {item.conteudo && (
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            {item.conteudo}
          </p>
        )}

        {/* Sugestão da IA para emails recebidos */}
        {item.tipo === 'email_recebido' && (item.metadados as any)?.sugestao && (
          <div className="mt-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary/70">
              <span
                className="material-symbols-outlined text-[13px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                smart_toy
              </span>
              Sugestão de resposta de {nomeIa}
            </p>
            <p className="text-[13px] leading-relaxed text-on-surface-variant whitespace-pre-wrap">
              {(item.metadados as any).sugestao}
            </p>
          </div>
        )}

        {/* Badge de origem */}
        <div className="mt-1.5 flex items-center gap-2">
          {item.origem === 'ia' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary/70">
              <span
                className="material-symbols-outlined text-[11px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                smart_toy
              </span>
              IA
            </span>
          )}
          {item.origem === 'agente' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary/70">
              <span className="material-symbols-outlined text-[11px]">build</span>
              Agente
            </span>
          )}
          {item.usuario && (
            <p className="text-xs text-on-surface-variant/50">{item.usuario.nome}</p>
          )}
        </div>
      </div>
    </div>
  )
}
