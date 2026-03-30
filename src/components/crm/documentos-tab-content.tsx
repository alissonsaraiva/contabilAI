'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Documento = {
  id: string
  nome: string
  tipo: string
  categoria: string | null
  origem: string
  status: string
  url: string
  mimeType: string | null
  tamanho: number | null
  criadoEm: string | Date
  xmlMetadata?: unknown
}

type Props = {
  documentos: Documento[]
  uploadSlot?: React.ReactNode
  empresaLink?: React.ReactNode
}

const CATEGORIAS: Record<string, string> = {
  geral:          'Geral',
  nota_fiscal:    'Nota Fiscal',
  imposto_renda:  'Imposto de Renda',
  guias_tributos: 'Guias/Tributos',
  relatorios:     'Relatórios',
  outros:         'Outros',
}

const STATUS_COLORS: Record<string, string> = {
  pendente:  'bg-orange-status/10 text-orange-status',
  aprovado:  'bg-green-status/10 text-green-status',
  rejeitado: 'bg-error/10 text-error',
  enviado:   'bg-primary/10 text-primary',
}

const ORIGEM_COLORS: Record<string, string> = {
  portal:      'bg-primary/10 text-primary',
  crm:         'bg-green-status/10 text-green-status',
  integracao:  'bg-tertiary/10 text-tertiary',
}

const ORIGEM_LABELS: Record<string, string> = {
  portal:     'Cliente',
  crm:        'Escritório',
  integracao: 'Integração',
}

function getIcon(mime: string | null, nome: string): string {
  const ext = nome.split('.').pop()?.toLowerCase() ?? ''
  if (mime === 'application/pdf' || ext === 'pdf') return 'picture_as_pdf'
  if (mime?.startsWith('image/') || ['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image'
  if (mime?.includes('xml') || ext === 'xml') return 'code'
  if (mime?.includes('spreadsheet') || mime?.includes('excel') || ['xls','xlsx','csv'].includes(ext)) return 'table_chart'
  if (mime?.includes('word') || ['doc','docx'].includes(ext)) return 'article'
  if (mime?.includes('zip') || ['zip','rar','7z'].includes(ext)) return 'folder_zip'
  return 'description'
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('pt-BR')
}

function grupoPorAno(docs: Documento[]) {
  const mapa = new Map<number, Documento[]>()
  for (const d of docs) {
    const ano = new Date(d.criadoEm).getFullYear()
    if (!mapa.has(ano)) mapa.set(ano, [])
    mapa.get(ano)!.push(d)
  }
  return [...mapa.entries()].sort((a, b) => b[0] - a[0])
}

export function DocumentosTabContent({ documentos: documentosIniciais, uploadSlot, empresaLink }: Props) {
  const router = useRouter()
  const [documentos, setDocumentos] = useState(documentosIniciais)
  const [q,        setQ]        = useState('')
  const [categoria, setCategoria] = useState('')
  const [origem,   setOrigem]   = useState('')
  const [status,   setStatus]   = useState('')
  const [collapsedAnos, setCollapsedAnos] = useState<Set<number>>(new Set())
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [deletando, setDeletando] = useState(false)

  async function handleDelete(id: string) {
    setDeletando(true)
    try {
      const res = await fetch(`/api/crm/documentos/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDocumentos(prev => prev.filter(d => d.id !== id))
      setConfirmandoId(null)
      toast.success('Documento removido')
      router.refresh()
    } catch {
      toast.error('Erro ao remover documento')
    } finally {
      setDeletando(false)
    }
  }

  const filtered = useMemo(() => {
    const qLow = q.toLowerCase().trim()
    return documentos.filter(d => {
      if (qLow && !d.nome.toLowerCase().includes(qLow) && !d.tipo.toLowerCase().includes(qLow)) return false
      if (categoria && d.categoria !== categoria) return false
      if (origem && d.origem !== origem) return false
      if (status && d.status !== status) return false
      return true
    })
  }, [documentos, q, categoria, origem, status])

  const grupos = grupoPorAno(filtered)
  const hasFilters = !!(q || categoria || origem || status)

  function toggleAno(ano: number) {
    setCollapsedAnos(prev => {
      const next = new Set(prev)
      if (next.has(ano)) next.delete(ano); else next.add(ano)
      return next
    })
  }

  const INPUT  = 'h-9 w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
  const SELECT = INPUT + ' appearance-none cursor-pointer pr-8'

  return (
    <div className="space-y-4">
      {empresaLink}

      {/* Toolbar: upload + busca */}
      <div className="flex flex-wrap items-end gap-3">
        {uploadSlot && <div>{uploadSlot}</div>}
        <div className="flex-1 min-w-[180px] relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-on-surface-variant/40">search</span>
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
            {Object.entries(CATEGORIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/40">expand_more</span>
        </div>
        <div className="relative w-32">
          <select className={SELECT} value={origem} onChange={e => setOrigem(e.target.value)}>
            <option value="">Origem</option>
            <option value="crm">Escritório</option>
            <option value="portal">Cliente</option>
            <option value="integracao">Integração</option>
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/40">expand_more</span>
        </div>
        <div className="relative w-32">
          <select className={SELECT} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Status</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="rejeitado">Rejeitado</option>
            <option value="enviado">Enviado</option>
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/40">expand_more</span>
        </div>
        {hasFilters && (
          <button
            onClick={() => { setQ(''); setCategoria(''); setOrigem(''); setStatus('') }}
            className="text-[12px] font-semibold text-primary hover:opacity-80 whitespace-nowrap"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Contagem */}
      {hasFilters && (
        <p className="text-[12px] text-on-surface-variant/60">
          {filtered.length} de {documentos.length} documento{documentos.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Lista por ano */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-outline-variant/15 bg-card py-10 text-center shadow-sm">
          <span className="material-symbols-outlined text-[36px] text-on-surface-variant/20">folder_open</span>
          <p className="text-[13px] text-on-surface-variant/60">
            {hasFilters ? 'Nenhum documento com esses filtros.' : 'Nenhum documento enviado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(([ano, docs]) => (
            <div key={ano}>
              {/* Cabeçalho do ano — clicável para colapsar */}
              <button
                onClick={() => toggleAno(ano)}
                className="mb-3 flex w-full items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-surface-container-low/50 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">
                  {collapsedAnos.has(ano) ? 'chevron_right' : 'expand_more'}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60">{ano}</span>
                <div className="h-px flex-1 bg-outline-variant/15" />
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold text-on-surface-variant/60">
                  {docs.length}
                </span>
              </button>

              {!collapsedAnos.has(ano) && (
                <div className="divide-y divide-outline-variant/10 overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
                  {docs.map(d => {
                    const icon = getIcon(d.mimeType, d.nome)
                    const xmlMeta = d.xmlMetadata as any
                    const isXML = d.mimeType?.includes('xml') || d.nome.toLowerCase().endsWith('.xml')
                    return (
                      <div key={d.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-container-low/20 transition-colors">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isXML ? 'bg-primary/10' : 'bg-surface-container'}`}>
                          <span
                            className={`material-symbols-outlined text-[18px] ${isXML ? 'text-primary' : 'text-on-surface-variant/60'}`}
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            {icon}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-on-surface truncate">{d.nome}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-[11px] text-on-surface-variant/60">
                              {d.tipo}
                              {d.categoria ? ` · ${CATEGORIAS[d.categoria] ?? d.categoria}` : ''}
                              {d.tamanho ? ` · ${formatSize(d.tamanho)}` : ''}
                              {` · ${formatDate(d.criadoEm)}`}
                            </span>
                          </div>
                          {isXML && xmlMeta && xmlMeta.tipo !== 'desconhecido' && (
                            <div className="mt-1.5 rounded-lg bg-primary/5 px-3 py-1.5 text-[11px] text-on-surface-variant/80 space-y-0.5">
                              {xmlMeta.emitenteNome && <p><span className="font-semibold">Emitente:</span> {xmlMeta.emitenteNome}</p>}
                              {xmlMeta.destinatarioNome && <p><span className="font-semibold">Destinatário:</span> {xmlMeta.destinatarioNome}</p>}
                              {xmlMeta.valorTotal && <p><span className="font-semibold">Valor:</span> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(xmlMeta.valorTotal)}</p>}
                              {xmlMeta.dataEmissao && <p><span className="font-semibold">Emissão:</span> {new Date(xmlMeta.dataEmissao).toLocaleDateString('pt-BR')}</p>}
                              {xmlMeta.numero && <p><span className="font-semibold">Nº:</span> {xmlMeta.numero}{xmlMeta.serie ? ` / Série ${xmlMeta.serie}` : ''}</p>}
                              {xmlMeta.emitenteCnpj && <p><span className="font-semibold">CNPJ Emitente:</span> {xmlMeta.emitenteCnpj}</p>}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ORIGEM_COLORS[d.origem] ?? 'bg-surface-container text-on-surface-variant'}`}>
                            {ORIGEM_LABELS[d.origem] ?? d.origem}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_COLORS[d.status] ?? 'bg-surface-container text-on-surface-variant'}`}>
                            {d.status}
                          </span>
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">download</span>
                          </a>
                          {confirmandoId === d.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(d.id)}
                                disabled={deletando}
                                className="flex h-7 items-center gap-1 rounded-lg bg-error/10 px-2 text-[11px] font-semibold text-error hover:bg-error/20 transition-colors disabled:opacity-50"
                              >
                                {deletando ? <span className="h-3 w-3 animate-spin rounded-full border border-error/30 border-t-error" /> : null}
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmandoId(null)}
                                className="flex h-7 items-center rounded-lg px-2 text-[11px] text-on-surface-variant/50 hover:bg-surface-container transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmandoId(d.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors"
                              title="Remover documento"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
