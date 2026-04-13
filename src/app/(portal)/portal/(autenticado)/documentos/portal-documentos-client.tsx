'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  CATEGORIAS_LABELS,
  STATUS_DOCUMENTO_COLORS,
} from '@/lib/services/documento-categorias'
import { getDocIcon, formatSize, getVencimentoInfo } from '@/components/crm/documento-row'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const CATEGORIAS_INFO: { value: string; label: string; icon: string }[] = [
  { value: 'todos',          label: 'Todos',              icon: 'folder_open' },
  { value: 'geral',          label: 'Geral',              icon: 'description' },
  { value: 'nota_fiscal',    label: 'Notas Fiscais',      icon: 'receipt_long' },
  { value: 'imposto_renda',  label: 'Imposto de Renda',   icon: 'account_balance' },
  { value: 'guias_tributos', label: 'Guias e Tributos',   icon: 'payments' },
  { value: 'relatorios',     label: 'Relatórios',         icon: 'bar_chart' },
  { value: 'outros',         label: 'Outros',             icon: 'more_horiz' },
]

const STATUS_LABELS: Record<string, string> = {
  pendente:  'Pendente',
  enviado:   'Enviado',
  aprovado:  'Aprovado',
  rejeitado: 'Rejeitado',
  vencido:   'Vencido',
}

type Doc = {
  id: string
  nome: string
  tipo: string
  categoria: string
  origem: string
  status: string
  url: string
  mimeType: string | null
  tamanho: number | null
  criadoEm: string
  visualizadoEm: string | null
  dataVencimento?: string | null
  xmlMetadata?: unknown
}

type Props = {
  documentos: Doc[]
  contagemMap: Record<string, number>
  totalGeral: number
}

type Grupo = { key: string; label: string; docs: Doc[] }

function grupoPorAnoMes(docs: Doc[]): Grupo[] {
  const mapa = new Map<string, Doc[]>()
  for (const d of docs) {
    const dt = new Date(d.criadoEm)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    if (!mapa.has(key)) mapa.set(key, [])
    mapa.get(key)!.push(d)
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const [ano, mes] = key.split('-').map(Number) as [number, number]
      return { key, label: `${MESES[mes - 1]!} ${ano}`, docs: items }
    })
}

export function PortalDocumentosClient({ documentos, contagemMap, totalGeral }: Props) {
  const [categoria, setCategoria] = useState('todos')
  const [q, setQ] = useState('')
  const [origem, setOrigem] = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [vistos, setVistos] = useState<Set<string>>(new Set())

  const isNovo = useCallback((d: Doc) =>
    d.origem === 'crm' && !d.visualizadoEm && !vistos.has(d.id),
    [vistos])

  function handleDownload(d: Doc) {
    if (isNovo(d)) {
      setVistos(prev => new Set(prev).add(d.id))
      fetch(`/api/portal/documentos/${d.id}/visualizar`, { method: 'PATCH' }).catch(err => console.error('[portal/documentos] falha ao marcar como visualizado:', err))
    }
    window.open(`/api/portal/documentos/${d.id}/download`, '_blank', 'noopener,noreferrer')
  }

  const novosMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const d of documentos) {
      if (d.origem === 'crm' && !d.visualizadoEm && !vistos.has(d.id)) {
        map['todos'] = (map['todos'] ?? 0) + 1
        map[d.categoria] = (map[d.categoria] ?? 0) + 1
      }
    }
    return map
  }, [documentos, vistos])

  const filtered = useMemo(() => {
    const qLow = q.toLowerCase().trim()
    return documentos.filter(d => {
      if (categoria !== 'todos' && d.categoria !== categoria) return false
      if (origem && d.origem !== origem) return false
      if (qLow) {
        const xmlMeta = d.xmlMetadata as any
        const searchable = [
          d.nome, d.tipo,
          xmlMeta?.emitenteNome, xmlMeta?.destinatarioNome,
          xmlMeta?.emitenteCnpj, xmlMeta?.destinatarioCnpj,
          xmlMeta?.numero,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!searchable.includes(qLow)) return false
      }
      return true
    })
  }, [documentos, categoria, q, origem])

  const grupos = grupoPorAnoMes(filtered)

  function toggleGrupo(key: string) {
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const INPUT = 'w-full h-9 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
  const SELECT = INPUT + ' appearance-none cursor-pointer pr-8'

  return (
    <div className="space-y-5">
      {/* Tabs de categoria */}
      <div className="flex overflow-x-auto pb-2 -mb-2 sm:flex-wrap gap-2 scrollbar-none snap-x snap-mandatory">
        {CATEGORIAS_INFO.map(cat => {
          const count = cat.value === 'todos' ? totalGeral : (contagemMap[cat.value] ?? 0)
          const novos = novosMap[cat.value] ?? 0
          if (cat.value !== 'todos' && count === 0) return null
          const isActive = categoria === cat.value
          return (
            <button
              key={cat.value}
              onClick={() => setCategoria(cat.value)}
              className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${isActive
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
            >
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cat.icon}</span>
              {cat.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${isActive ? 'bg-white/20' : 'bg-surface-container-high'}`}>
                  {count}
                </span>
              )}
              {novos > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white ring-2 ring-background">
                  {novos}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Busca e filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-on-surface-variant/40">search</span>
          <input
            className={INPUT + ' pl-8'}
            placeholder="Buscar por nome, tipo, CNPJ, emitente..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className="relative w-40">
          <select className={SELECT} value={origem} onChange={e => setOrigem(e.target.value)}>
            <option value="">Todas as origens</option>
            <option value="portal">Enviados por mim</option>
            <option value="crm">Pelo escritório</option>
            <option value="integracao">Integração</option>
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/40">expand_more</span>
        </div>
        {(q || origem) && (
          <button
            onClick={() => { setQ(''); setOrigem('') }}
            className="text-[12px] font-semibold text-primary hover:opacity-80 self-center whitespace-nowrap"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Resultado */}
      {(q || origem) && (
        <p className="text-[12px] text-on-surface-variant/60">
          {filtered.length} documento{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[16px] border border-outline-variant/15 bg-card/60 py-16 text-center shadow-sm">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">folder_open</span>
          <p className="text-[14px] font-medium text-on-surface-variant/60">
            {q || origem || categoria !== 'todos' ? 'Nenhum documento com esses filtros.' : 'Nenhum documento encontrado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(grupo => (
            <div key={grupo.key}>
              <button
                onClick={() => toggleGrupo(grupo.key)}
                className="mb-3 flex w-full items-center gap-2 rounded-xl px-1 py-1.5 hover:bg-surface-container-low/50 transition-colors"
              >
                <span className="material-symbols-outlined text-[15px] text-on-surface-variant/50">
                  {collapsedKeys.has(grupo.key) ? 'chevron_right' : 'expand_more'}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60">{grupo.label}</span>
                <div className="h-px flex-1 bg-outline-variant/15" />
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant/60">
                  {grupo.docs.length}
                </span>
              </button>

              {!collapsedKeys.has(grupo.key) && (
                <div className="overflow-hidden rounded-[16px] border border-outline-variant/15 bg-card/60 shadow-sm">
                  <ul className="divide-y divide-outline-variant/10">
                    {grupo.docs.map(d => {
                      const statusColor = STATUS_DOCUMENTO_COLORS[d.status] ?? 'text-on-surface-variant bg-surface-container'
                      const statusLabel = STATUS_LABELS[d.status] ?? d.status
                      const icon = getDocIcon(d.mimeType, d.nome)
                      const isXML = d.mimeType?.includes('xml') || d.nome.toLowerCase().endsWith('.xml')
                      const xmlMeta = d.xmlMetadata as any
                      const novo = isNovo(d)
                      const vencInfo = getVencimentoInfo(d.dataVencimento)
                      return (
                        <li key={d.id} className={`flex flex-col sm:flex-row sm:items-start gap-3 p-4 sm:px-5 sm:py-3.5 transition-colors ${novo ? 'bg-primary/[0.03]' : ''}`}>
                          <div className="flex items-start gap-3 w-full sm:w-auto flex-1 min-w-0">
                            <span
                              className={`mt-0.5 material-symbols-outlined text-[20px] shrink-0 ${isXML ? 'text-primary' : 'text-on-surface-variant/50'}`}
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              {icon}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => d.url && handleDownload(d)}
                                  className="text-left text-[13px] font-medium text-on-surface truncate max-w-[calc(100%-48px)] hover:text-primary transition-colors cursor-pointer"
                                >
                                  {d.nome}
                                </button>
                                {novo && (
                                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                    Novo
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                                <span className="text-[11px] text-on-surface-variant/60">
                                  {d.tipo} · {new Date(d.criadoEm).toLocaleDateString('pt-BR')}
                                  {d.tamanho ? ` · ${formatSize(d.tamanho)}` : ''}
                                </span>
                                {d.origem === 'portal' && (
                                  <span className="text-[10px] font-semibold text-primary/70">↑ enviado por você</span>
                                )}
                              </div>

                              {/* Badge de vencimento */}
                              {vencInfo && (
                                <div className="mt-1">
                                  <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${vencInfo.color}`}>
                                    <span className="material-symbols-outlined text-[11px]">schedule</span>
                                    {vencInfo.label}
                                  </span>
                                </div>
                              )}

                              {/* XML metadata */}
                              {isXML && xmlMeta && xmlMeta.tipo !== 'desconhecido' && (
                                <div className="mt-1.5 rounded-lg bg-primary/5 px-3 py-2 text-[11px] text-on-surface-variant/80 space-y-0.5">
                                  {xmlMeta.emitenteNome && <p><span className="font-semibold">Emitente:</span> {xmlMeta.emitenteNome}</p>}
                                  {xmlMeta.destinatarioNome && <p><span className="font-semibold">Destinatário:</span> {xmlMeta.destinatarioNome}</p>}
                                  {xmlMeta.valorTotal && <p><span className="font-semibold">Valor:</span> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(xmlMeta.valorTotal)}</p>}
                                  {xmlMeta.dataEmissao && <p><span className="font-semibold">Emissão:</span> {new Date(xmlMeta.dataEmissao).toLocaleDateString('pt-BR')}</p>}
                                  {xmlMeta.numero && <p><span className="font-semibold">Nº:</span> {xmlMeta.numero}{xmlMeta.serie ? ` / Série ${xmlMeta.serie}` : ''}</p>}
                                  {xmlMeta.emitenteCnpj && <p><span className="font-semibold">CNPJ:</span> {xmlMeta.emitenteCnpj}</p>}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-start gap-2 shrink-0 w-full sm:w-auto ml-10 sm:ml-0 pt-2 sm:pt-0 border-t sm:border-0 border-outline-variant/10">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusColor}`}>
                              {statusLabel}
                            </span>
                            {d.url && (
                              <button
                                onClick={() => handleDownload(d)}
                                aria-label={`Abrir ${d.nome}`}
                                className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-95 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:h-8 sm:w-8 sm:justify-center sm:rounded-lg sm:hover:bg-surface-container sm:hover:text-primary"
                              >
                                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">open_in_new</span>
                                <span className="sm:hidden">Abrir</span>
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
