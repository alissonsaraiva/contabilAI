'use client'

/**
 * DocumentoPicker — modal reutilizável para selecionar arquivos já existentes no sistema.
 *
 * Uso com contexto (email de João, chat com João):
 *   <DocumentoPicker clienteId="..." onSelect={doc => ...} onClose={() => ...} open />
 *
 * Uso sem contexto (comunicados, busca livre):
 *   <DocumentoPicker onSelect={doc => ...} onClose={() => ...} open />
 *   → exibe campo de busca por cliente
 */

import { useState, useEffect, useCallback } from 'react'

export type DocSistema = {
  id:        string
  nome:      string
  tipo:      string
  categoria: string
  url:       string
  mimeType:  string | null
  tamanho:   number | null
  criadoEm:  string
  cliente?:  { id: string; nome: string } | null
}

type Props = {
  open:       boolean
  onClose:    () => void
  onSelect:   (doc: DocSistema) => void
  clienteId?: string
  leadId?:    string
  titulo?:    string
}

const CATEGORIAS = [
  { value: '', label: 'Todas as categorias' },
  { value: 'geral',          label: 'Geral' },
  { value: 'nota_fiscal',    label: 'Nota Fiscal' },
  { value: 'guias_tributos', label: 'Guias / Tributos' },
  { value: 'imposto_renda',  label: 'Imposto de Renda' },
  { value: 'relatorios',     label: 'Relatórios' },
  { value: 'outros',         label: 'Outros' },
]

function mimeIcon(mime: string | null) {
  if (!mime) return 'attach_file'
  if (mime.includes('pdf'))   return 'picture_as_pdf'
  if (mime.startsWith('image')) return 'image'
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'table_chart'
  if (mime.includes('word') || mime.includes('msword')) return 'description'
  if (mime.includes('xml'))   return 'code'
  return 'attach_file'
}

function formatBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024)       return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentoPicker({ open, onClose, onSelect, clienteId, leadId, titulo }: Props) {
  const hasContext = !!(clienteId || leadId)

  const [docs,      setDocs]      = useState<DocSistema[]>([])
  const [loading,   setLoading]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [categoria, setCategoria] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce do campo de busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchDocs = useCallback(async () => {
    // Sem contexto, exige ao menos 2 caracteres
    if (!hasContext && debouncedSearch.length < 2) {
      setDocs([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clienteId)       params.set('clienteId', clienteId)
      else if (leadId)     params.set('leadId', leadId)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (categoria)       params.set('categoria', categoria)

      const res = await fetch(`/api/crm/documentos?${params}`)
      if (res.ok) setDocs(await res.json())
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [clienteId, leadId, hasContext, debouncedSearch, categoria])

  // Busca automática ao abrir (com contexto) ou ao digitar (sem contexto)
  useEffect(() => {
    if (!open) return
    fetchDocs()
  }, [open, fetchDocs])

  // Reseta ao fechar
  useEffect(() => {
    if (!open) {
      setSearch('')
      setCategoria('')
      setDocs([])
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-[18px] border border-outline-variant/20 bg-card shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-5 py-4 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              folder_open
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-on-surface">
              {titulo ?? 'Arquivos do sistema'}
            </h2>
            <p className="text-[11px] text-on-surface-variant/60">
              {hasContext ? 'Documentos salvos deste cliente' : 'Busque por nome, tipo ou cliente'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Filtros */}
        <div className="border-b border-outline-variant/10 px-5 py-3 space-y-2 shrink-0">
          {/* Campo de busca */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant/40">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={hasContext ? 'Buscar por nome ou tipo...' : 'Buscar por nome, tipo ou cliente...'}
              className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low pl-8 pr-4 py-2 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
              autoFocus
            />
          </div>

          {/* Categoria */}
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[12px] text-on-surface focus:border-primary/40 focus:outline-none"
          >
            {CATEGORIAS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            </div>
          ) : !hasContext && debouncedSearch.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant/20 mb-2">manage_search</span>
              <p className="text-[13px] text-on-surface-variant/50">
                Digite ao menos 2 caracteres para buscar
              </p>
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <span className="material-symbols-outlined text-[40px] text-on-surface-variant/20 mb-2">folder_off</span>
              <p className="text-[13px] text-on-surface-variant/50">Nenhum documento encontrado</p>
              {search && (
                <p className="mt-1 text-[11px] text-on-surface-variant/40">
                  Tente outros termos ou remova os filtros
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1 py-1">
              {docs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => { onSelect(doc); onClose() }}
                  className="group w-full flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-all hover:bg-primary/6 active:bg-primary/10"
                >
                  {/* Ícone */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container group-hover:bg-primary/10 transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant/60 group-hover:text-primary transition-colors">
                      {mimeIcon(doc.mimeType)}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-on-surface truncate leading-tight">
                      {doc.nome}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-on-surface-variant/60 truncate">{doc.tipo}</span>
                      {doc.cliente?.nome && (
                        <>
                          <span className="text-[10px] text-on-surface-variant/30">·</span>
                          <span className="text-[11px] text-on-surface-variant/50 truncate">{doc.cliente.nome}</span>
                        </>
                      )}
                      {doc.tamanho && (
                        <>
                          <span className="text-[10px] text-on-surface-variant/30">·</span>
                          <span className="text-[11px] text-on-surface-variant/40">{formatBytes(doc.tamanho)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Data + seta */}
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-on-surface-variant/40">
                      {new Date(doc.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </p>
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant/20 group-hover:text-primary/50 transition-colors">
                      chevron_right
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-outline-variant/10 px-5 py-3 shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2 text-[13px] font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
