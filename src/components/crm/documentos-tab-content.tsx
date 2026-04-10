'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DocumentoRow, type Documento } from './documento-row'
import { DocumentoEditModal } from './documento-edit-modal'
import { DocumentoPreviewModal } from './documento-preview-modal'
import { DocumentoBulkActions } from './documento-bulk-actions'
import { CATEGORIAS_LABELS } from '@/lib/services/documento-categorias'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type Props = {
  documentos: Documento[]
  uploadSlot?: React.ReactNode
  empresaLink?: React.ReactNode
}

type Grupo = { key: string; label: string; docs: Documento[] }

function grupoPorAnoMes(docs: Documento[]): Grupo[] {
  const mapa = new Map<string, Documento[]>()
  for (const d of docs) {
    const dt = new Date(d.criadoEm)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    if (!mapa.has(key)) mapa.set(key, [])
    mapa.get(key)!.push(d)
  }
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const [ano, mes] = key.split('-').map(Number)
      return { key, label: `${MESES[mes - 1]} ${ano}`, docs: items }
    })
}

const INPUT  = 'h-9 w-full rounded-[10px] border border-outline-variant/60 bg-surface-container px-3 text-[13px] text-on-surface focus:border-primary/70 focus:outline-none focus:ring-[3px] focus:ring-primary/15 placeholder:text-on-surface-variant/60'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-8'

export function DocumentosTabContent({ documentos: documentosIniciais, uploadSlot, empresaLink }: Props) {
  const router = useRouter()
  const [documentos, setDocumentos] = useState(documentosIniciais)

  // Filtros
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  const [origem, setOrigem] = useState('')
  const [status, setStatus] = useState('')
  const [visibilidade, setVisibilidade] = useState('')

  // UI state
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [editDoc, setEditDoc] = useState<Documento | null>(null)
  const [previewDoc, setPreviewDoc] = useState<Documento | null>(null)

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Contagens
  const totalDocs = documentos.length
  const totalInternos = useMemo(() => documentos.filter(d => !d.visivelPortal).length, [documentos])
  const totalNaoVistos = useMemo(
    () => documentos.filter(d => d.origem === 'crm' && d.visivelPortal && !d.visualizadoEm).length,
    [documentos],
  )

  // Filtro
  const filtered = useMemo(() => {
    const qLow = q.toLowerCase().trim()
    return documentos.filter(d => {
      if (qLow && !d.nome.toLowerCase().includes(qLow) && !d.tipo.toLowerCase().includes(qLow)) return false
      if (categoria && d.categoria !== categoria) return false
      if (origem && d.origem !== origem) return false
      if (status && d.status !== status) return false
      if (visibilidade === 'portal' && !d.visivelPortal) return false
      if (visibilidade === 'interno' && d.visivelPortal) return false
      return true
    })
  }, [documentos, q, categoria, origem, status, visibilidade])

  const grupos = grupoPorAnoMes(filtered)
  const hasFilters = !!(q || categoria || origem || status || visibilidade)

  // ─── Handlers de grupo ──────────────────────────────────────────────

  function toggleGrupo(key: string) {
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // ─── Handlers de seleção ────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  function toggleSelectGrupo(grupo: Grupo) {
    const grupoIds = grupo.docs.map(d => d.id)
    const allSelected = grupoIds.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        grupoIds.forEach(id => next.delete(id))
      } else {
        grupoIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(filtered.map(d => d.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  // ─── Handlers de CRUD ───────────────────────────────────────────────

  function handleUpdate(updated: Partial<Documento> & { id: string }) {
    setDocumentos(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d))
  }

  function handleDelete(id: string) {
    setDocumentos(prev => prev.filter(d => d.id !== id))
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
    router.refresh()
  }

  function handleBulkDeleted(deletedIds: string[]) {
    const idSet = new Set(deletedIds)
    setDocumentos(prev => prev.filter(d => !idSet.has(d.id)))
    setSelectedIds(new Set())
    router.refresh()
  }

  function handleBulkUpdated(updatedIds: string[], patch: Record<string, unknown>) {
    setDocumentos(prev => prev.map(d => updatedIds.includes(d.id) ? { ...d, ...patch } : d))
    setSelectedIds(new Set())
  }

  function handleEditSaved(updated: Partial<Documento> & { id: string }) {
    handleUpdate(updated)
    setEditDoc(null)
  }

  function clearFilters() {
    setQ(''); setCategoria(''); setOrigem(''); setStatus(''); setVisibilidade('')
  }

  return (
    <div className="space-y-3">
      {empresaLink}

      {/* Upload slot */}
      {uploadSlot && (
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/70">Enviar documento</span>
          <div className="h-px flex-1 bg-outline-variant/30" />
          {uploadSlot}
        </div>
      )}

      {/* Resumo — total, internos e não visualizados */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-on-surface-variant/60">
        <span>{totalDocs} documento{totalDocs !== 1 ? 's' : ''}</span>
        {totalInternos > 0 && (
          <>
            <span>·</span>
            <button
              onClick={() => setVisibilidade(visibilidade === 'interno' ? '' : 'interno')}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-colors ${
                visibilidade === 'interno' ? 'bg-primary/10 text-primary' : 'hover:text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">visibility_off</span>
              {totalInternos} interno{totalInternos !== 1 ? 's' : ''}
            </button>
          </>
        )}
        {totalNaoVistos > 0 && (
          <>
            <span>·</span>
            <span className="flex items-center gap-1 rounded-full bg-orange-status/10 px-2 py-0.5 font-semibold text-orange-status">
              <span className="material-symbols-outlined text-[13px]">mark_email_unread</span>
              {totalNaoVistos} não visto{totalNaoVistos !== 1 ? 's' : ''} pelo cliente
            </span>
          </>
        )}
      </div>

      {/* Barra de ações em lote */}
      <DocumentoBulkActions
        selectedIds={selectedIds}
        totalFiltered={filtered.length}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onDeleted={handleBulkDeleted}
        onBulkUpdated={handleBulkUpdated}
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-on-surface-variant/60">search</span>
          <input
            className={INPUT + ' pl-8'}
            placeholder="Buscar por nome ou tipo..."
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div className="relative w-36">
          <select className={SELECT} value={categoria} onChange={e => setCategoria(e.target.value)}>
            <option value="">Categoria</option>
            {Object.entries(CATEGORIAS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/60">expand_more</span>
        </div>
        <div className="relative w-32">
          <select className={SELECT} value={origem} onChange={e => setOrigem(e.target.value)}>
            <option value="">Origem</option>
            <option value="crm">Escritório</option>
            <option value="portal">Cliente</option>
            <option value="integracao">Integração</option>
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/60">expand_more</span>
        </div>
        <div className="relative w-32">
          <select className={SELECT} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Status</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="rejeitado">Rejeitado</option>
            <option value="enviado">Enviado</option>
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/60">expand_more</span>
        </div>
        <div className="relative w-32">
          <select className={SELECT} value={visibilidade} onChange={e => setVisibilidade(e.target.value)}>
            <option value="">Portal</option>
            <option value="portal">Visível</option>
            <option value="interno">Interno</option>
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/60">expand_more</span>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[12px] font-semibold text-primary hover:opacity-80 whitespace-nowrap"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Contagem filtrada */}
      {hasFilters && (
        <p className="text-[12px] text-on-surface-variant/60">
          {filtered.length} de {totalDocs} documento{totalDocs !== 1 ? 's' : ''}
        </p>
      )}

      {/* Lista por ano/mês */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-outline-variant/15 bg-card py-10 text-center shadow-sm">
          <span className="material-symbols-outlined text-[36px] text-on-surface-variant/20">folder_open</span>
          <p className="text-[13px] text-on-surface-variant/60">
            {hasFilters ? 'Nenhum documento com esses filtros.' : 'Nenhum documento enviado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(grupo => {
            const grupoAllSelected = grupo.docs.length > 0 && grupo.docs.every(d => selectedIds.has(d.id))
            const grupoSomeSelected = grupo.docs.some(d => selectedIds.has(d.id))
            return (
              <div key={grupo.key}>
                <div className="mb-3 flex w-full items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-surface-container-low/50 transition-colors">
                  {/* Checkbox do grupo */}
                  <input
                    type="checkbox"
                    checked={grupoAllSelected}
                    ref={el => { if (el) el.indeterminate = grupoSomeSelected && !grupoAllSelected }}
                    onChange={() => toggleSelectGrupo(grupo)}
                    className="ml-0.5 h-3.5 w-3.5 rounded border-outline-variant/60 text-primary focus:ring-primary/30 cursor-pointer"
                  />
                  <button
                    onClick={() => toggleGrupo(grupo.key)}
                    className="flex flex-1 items-center gap-3"
                  >
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">
                      {collapsedKeys.has(grupo.key) ? 'chevron_right' : 'expand_more'}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60">{grupo.label}</span>
                    <div className="h-px flex-1 bg-outline-variant/15" />
                    <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant/60">
                      {grupo.docs.length}
                    </span>
                  </button>
                </div>

                {!collapsedKeys.has(grupo.key) && (
                  <div className="divide-y divide-outline-variant/10 overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
                    {grupo.docs.map(d => (
                      <DocumentoRow
                        key={d.id}
                        doc={d}
                        selected={selectedIds.has(d.id)}
                        onToggleSelect={toggleSelect}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onEdit={setEditDoc}
                        onPreview={setPreviewDoc}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de edição */}
      {editDoc && (
        <DocumentoEditModal
          documento={editDoc}
          onClose={() => setEditDoc(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* Modal de preview */}
      {previewDoc && (
        <DocumentoPreviewModal
          nome={previewDoc.nome}
          url={`/api/crm/documentos/${previewDoc.id}/download`}
          mimeType={previewDoc.mimeType}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  )
}
