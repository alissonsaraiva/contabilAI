'use client'

import { useState, useMemo } from 'react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const CATEGORIAS_INFO: { value: string; label: string; icon: string }[] = [
  { value: 'todos',          label: 'Todos',             icon: 'folder_open' },
  { value: 'geral',          label: 'Geral',             icon: 'description' },
  { value: 'nota_fiscal',    label: 'Notas Fiscais',     icon: 'receipt_long' },
  { value: 'imposto_renda',  label: 'Imposto de Renda',  icon: 'account_balance' },
  { value: 'guias_tributos', label: 'Guias e Tributos',  icon: 'payments' },
  { value: 'relatorios',     label: 'Relatórios',        icon: 'bar_chart' },
  { value: 'outros',         label: 'Outros',            icon: 'more_horiz' },
]

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente:  { label: 'Pendente',  color: 'text-yellow-600 bg-yellow-500/10' },
  enviado:   { label: 'Enviado',   color: 'text-blue-600 bg-blue-500/10' },
  aprovado:  { label: 'Aprovado',  color: 'text-green-600 bg-green-500/10' },
  rejeitado: { label: 'Rejeitado', color: 'text-red-600 bg-red-500/10' },
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
  xmlMetadata?: unknown
}

type Props = {
  documentos: Doc[]
  contagemMap: Record<string, number>
  totalGeral: number
}

function getIcon(mime: string | null, nome: string): string {
  const ext = nome.split('.').pop()?.toLowerCase() ?? ''
  if (mime === 'application/pdf' || ext === 'pdf') return 'picture_as_pdf'
  if (mime?.startsWith('image/') || ['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image'
  if (mime?.includes('xml') || ext === 'xml') return 'code'
  if (mime?.includes('spreadsheet') || ['xls','xlsx','csv'].includes(ext)) return 'table_chart'
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

function grupoPorAnoMes(docs: Doc[]) {
  const grupos: { ano: number; mes: number; label: string; key: string; docs: Doc[] }[] = []
  const mapa = new Map<string, Doc[]>()
  for (const d of docs) {
    const dt = new Date(d.criadoEm)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    if (!mapa.has(key)) mapa.set(key, [])
    mapa.get(key)!.push(d)
  }
  for (const [key, items] of mapa.entries()) {
    const [ano, mes] = key.split('-').map(Number)
    grupos.push({ ano, mes, key, label: `${MESES[mes - 1]} ${ano}`, docs: items })
  }
  return grupos.sort((a, b) => b.ano !== a.ano ? b.ano - a.ano : b.mes - a.mes)
}

export function PortalDocumentosClient({ documentos, contagemMap, totalGeral }: Props) {
  const [categoria, setCategoria] = useState('todos')
  const [q,         setQ]         = useState('')
  const [origem,    setOrigem]    = useState('')
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())

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
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS_INFO.map(cat => {
          const count = cat.value === 'todos' ? totalGeral : (contagemMap[cat.value] ?? 0)
          if (cat.value !== 'todos' && count === 0) return null
          const isActive = categoria === cat.value
          return (
            <button
              key={cat.value}
              onClick={() => setCategoria(cat.value)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                isActive
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
              {/* Cabeçalho mês/ano — clicável */}
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
                      const s       = STATUS_LABEL[d.status] ?? { label: d.status, color: 'text-on-surface-variant bg-surface-container' }
                      const icon    = getIcon(d.mimeType, d.nome)
                      const isXML   = d.mimeType?.includes('xml') || d.nome.toLowerCase().endsWith('.xml')
                      const xmlMeta = d.xmlMetadata as any
                      return (
                        <li key={d.id} className="flex items-start gap-3 px-5 py-3.5">
                          <span
                            className={`mt-0.5 material-symbols-outlined text-[20px] shrink-0 ${isXML ? 'text-primary' : 'text-on-surface-variant/50'}`}
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            {icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-on-surface truncate">{d.nome}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              <span className="text-[11px] text-on-surface-variant/60">
                                {d.tipo} · {new Date(d.criadoEm).toLocaleDateString('pt-BR')}
                                {d.tamanho ? ` · ${formatSize(d.tamanho)}` : ''}
                              </span>
                              {d.origem === 'portal' && (
                                <span className="text-[10px] font-semibold text-primary/70">↑ enviado por você</span>
                              )}
                            </div>
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
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                              {s.label}
                            </span>
                            {d.url && (
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
                              >
                                <span className="material-symbols-outlined text-[18px]">download</span>
                              </a>
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
