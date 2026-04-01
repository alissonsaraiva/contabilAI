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

type ClienteOpt = { id: string; nome: string; email: string | null }

export function DocumentoPicker({ open, onClose, onSelect, clienteId, leadId, titulo }: Props) {
  const hasContext = !!(clienteId || leadId)

  // Quando sem contexto: etapa de seleção de cliente
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteOpt | null>(null)
  const [clienteBusca,       setClienteBusca]       = useState('')
  const [clienteOpts,        setClienteOpts]        = useState<ClienteOpt[]>([])
  const [clienteLoading,     setClienteLoading]     = useState(false)
  const [debouncedClienteBusca, setDebouncedClienteBusca] = useState('')

  // Debounce busca de cliente
  useEffect(() => {
    const t = setTimeout(() => setDebouncedClienteBusca(clienteBusca), 350)
    return () => clearTimeout(t)
  }, [clienteBusca])

  useEffect(() => {
    if (hasContext || debouncedClienteBusca.length < 2) { setClienteOpts([]); return }
    setClienteLoading(true)
    fetch(`/api/clientes?q=${encodeURIComponent(debouncedClienteBusca)}`)
      .then(r => r.json())
      .then((data: ClienteOpt[]) => setClienteOpts(data.slice(0, 8)))
      .catch(() => setClienteOpts([]))
      .finally(() => setClienteLoading(false))
  }, [hasContext, debouncedClienteBusca])

  // ID efetivo para buscar docs: prop ou cliente selecionado
  const effectiveClienteId = clienteId ?? (clienteSelecionado?.id)
  const effectiveLeadId    = leadId
  const hasEffectiveContext = !!(effectiveClienteId || effectiveLeadId)

  const [docs,      setDocs]      = useState<DocSistema[]>([])
  const [loading,   setLoading]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [categoria, setCategoria] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce do campo de busca de docs
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchDocs = useCallback(async () => {
    if (!hasEffectiveContext) { setDocs([]); return }

    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (effectiveClienteId)  params.set('clienteId', effectiveClienteId)
      else if (effectiveLeadId) params.set('leadId', effectiveLeadId)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (categoria)       params.set('categoria', categoria)

      const res = await fetch(`/api/crm/documentos?${params}`)
      if (res.ok) setDocs(await res.json())
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [effectiveClienteId, effectiveLeadId, hasEffectiveContext, debouncedSearch, categoria])

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
      setClienteSelecionado(null)
      setClienteBusca('')
      setClienteOpts([])
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
              {hasContext
                ? 'Documentos salvos deste cliente'
                : clienteSelecionado
                  ? clienteSelecionado.nome
                  : 'Selecione um cliente para ver os documentos'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Etapa 1 (sem contexto): selecionar cliente */}
        {!hasContext && !clienteSelecionado && (
          <div className="flex flex-col gap-3 px-5 py-4 shrink-0">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant/40">person_search</span>
              <input
                type="text"
                value={clienteBusca}
                onChange={e => setClienteBusca(e.target.value)}
                placeholder="Buscar cliente pelo nome ou e-mail..."
                className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low pl-8 pr-4 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
                autoFocus
              />
            </div>

            <div className="flex-1 min-h-[120px]">
              {clienteLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                </div>
              ) : debouncedClienteBusca.length < 2 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <span className="material-symbols-outlined text-[36px] text-on-surface-variant/20 mb-2">group</span>
                  <p className="text-[12px] text-on-surface-variant/50">Digite ao menos 2 caracteres</p>
                </div>
              ) : clienteOpts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <span className="material-symbols-outlined text-[36px] text-on-surface-variant/20 mb-2">person_off</span>
                  <p className="text-[12px] text-on-surface-variant/50">Nenhum cliente encontrado</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {clienteOpts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setClienteSelecionado(c); setClienteBusca(''); setClienteOpts([]) }}
                      className="group w-full flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left hover:bg-primary/6 transition-colors"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <span className="text-[11px] font-bold text-primary">{c.nome.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-on-surface truncate">{c.nome}</p>
                        {c.email && <p className="text-[11px] text-on-surface-variant/50 truncate">{c.email}</p>}
                      </div>
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant/30 group-hover:text-primary/50 transition-colors">chevron_right</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Etapa 2 / contexto existente: filtros e lista de documentos */}
        {(hasContext || clienteSelecionado) && (
          <>
            {/* Botão de trocar cliente (só quando sem contexto prop) */}
            {!hasContext && clienteSelecionado && (
              <div className="flex items-center gap-2 border-b border-outline-variant/10 px-5 py-2 shrink-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-[9px] font-bold text-primary">{clienteSelecionado.nome.charAt(0).toUpperCase()}</span>
                </div>
                <span className="flex-1 text-[12px] font-medium text-on-surface truncate">{clienteSelecionado.nome}</span>
                <button
                  onClick={() => { setClienteSelecionado(null); setDocs([]); setSearch(''); setCategoria('') }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-on-surface-variant/60 hover:text-primary hover:bg-primary/8 transition-colors"
                >
                  <span className="material-symbols-outlined text-[13px]">swap_horiz</span>
                  Trocar
                </button>
              </div>
            )}

            {/* Filtros */}
            <div className="border-b border-outline-variant/10 px-5 py-3 space-y-2 shrink-0">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant/40">search</span>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou tipo..."
                  className="w-full rounded-xl border border-outline-variant/20 bg-surface-container-low pl-8 pr-4 py-2 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
                  autoFocus={!hasContext}
                />
              </div>
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

            {/* Lista de documentos */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
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
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container group-hover:bg-primary/10 transition-colors">
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant/60 group-hover:text-primary transition-colors">
                          {mimeIcon(doc.mimeType)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-on-surface truncate leading-tight">{doc.nome}</p>
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
          </>
        )}

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
