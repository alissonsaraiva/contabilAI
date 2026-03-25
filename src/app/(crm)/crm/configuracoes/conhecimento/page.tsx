'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type TipoConhecimento = 'base_conhecimento' | 'fiscal_normativo' | 'template'

type KnowledgeEntry = {
  sourceId: string
  tipo: TipoConhecimento
  titulo: string | null
  preview: string
  totalChunks: number
  criadoEm: string
}

const TIPOS: { value: TipoConhecimento; label: string; icon: string; desc: string }[] = [
  { value: 'base_conhecimento', label: 'Base de Conhecimento', icon: 'menu_book',      desc: 'FAQs, guias e respostas frequentes' },
  { value: 'fiscal_normativo',  label: 'Fiscal / Normativo',  icon: 'gavel',           desc: 'Leis, regulamentos e normas fiscais' },
  { value: 'template',          label: 'Templates',           icon: 'description',     desc: 'Modelos de documentos e comunicados' },
]

const INPUT  = 'w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL  = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

export default function ConhecimentoPage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [filterTipo, setFilterTipo] = useState<TipoConhecimento | ''>('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form state
  const [titulo, setTitulo]   = useState('')
  const [conteudo, setConteudo] = useState('')
  const [tipo, setTipo]       = useState<TipoConhecimento>('base_conhecimento')
  const [saving, setSaving]   = useState(false)
  const [formOpen, setFormOpen] = useState(false)

  const loadEntries = useCallback(async () => {
    setLoadingList(true)
    try {
      const url = filterTipo ? `/api/conhecimento?tipo=${filterTipo}` : '/api/conhecimento'
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      setEntries(await res.json())
    } catch {
      toast.error('Erro ao carregar base de conhecimento')
    } finally {
      setLoadingList(false)
    }
  }, [filterTipo])

  useEffect(() => { loadEntries() }, [loadEntries])

  async function handleSave() {
    if (!titulo.trim() || !conteudo.trim()) {
      toast.error('Preencha título e conteúdo')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/conhecimento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo.trim(), conteudo: conteudo.trim(), tipo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Artigo salvo em ${data.chunks} chunk(s)`)
      setTitulo(''); setConteudo(''); setTipo('base_conhecimento')
      setFormOpen(false)
      loadEntries()
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao salvar artigo')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(sourceId: string, titulo: string | null) {
    if (!confirm(`Deletar "${titulo ?? sourceId}" e todos os seus chunks?`)) return
    setDeletingId(sourceId)
    try {
      const res = await fetch(`/api/conhecimento/${sourceId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Artigo removido')
      setEntries(prev => prev.filter(e => e.sourceId !== sourceId))
    } catch {
      toast.error('Erro ao remover artigo')
    } finally {
      setDeletingId(null)
    }
  }

  const tipoInfo = (t: TipoConhecimento) => TIPOS.find(x => x.value === t)

  return (
    <div className="space-y-5">

      {/* Header + Novo artigo */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_stories
              </span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface">Base de Conhecimento</h3>
              <p className="text-[12px] text-on-surface-variant/80">FAQs, normas fiscais e templates para a IA</p>
            </div>
          </div>
          <button
            onClick={() => setFormOpen(o => !o)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">{formOpen ? 'close' : 'add'}</span>
            {formOpen ? 'Cancelar' : 'Novo artigo'}
          </button>
        </div>

        {/* Formulário de criação */}
        {formOpen && (
          <div className="space-y-4 rounded-xl border border-outline-variant/15 bg-surface-container-low/40 p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Título</label>
                <input
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  className={INPUT}
                  placeholder="Ex: Como declarar Simples Nacional?"
                />
              </div>
              <div>
                <label className={LABEL}>Tipo</label>
                <select
                  value={tipo}
                  onChange={e => setTipo(e.target.value as TipoConhecimento)}
                  className={`${INPUT} cursor-pointer`}
                >
                  {TIPOS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL}>Conteúdo</label>
              <textarea
                value={conteudo}
                onChange={e => setConteudo(e.target.value)}
                className={`${INPUT} min-h-[160px] resize-y`}
                placeholder="Cole ou escreva o conteúdo do artigo. O sistema divide automaticamente em chunks otimizados para busca semântica."
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/50">
                {conteudo.length} caracteres · ~{Math.ceil(conteudo.length / 1600)} chunk(s) estimado(s)
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {saving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <span className="material-symbols-outlined text-[16px]">save</span>}
                Salvar e indexar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterTipo('')}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors border',
            filterTipo === ''
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-primary bg-card',
          )}
        >
          Todos
        </button>
        {TIPOS.map(t => (
          <button
            key={t.value}
            onClick={() => setFilterTipo(t.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors border',
              filterTipo === t.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/30 hover:text-primary bg-card',
            )}
          >
            <span className="material-symbols-outlined text-[13px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Lista de artigos */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        {loadingList ? (
          <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[13px]">Carregando...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-[40px] opacity-30">auto_stories</span>
            <p className="text-[13px]">Nenhum artigo cadastrado</p>
            <button
              onClick={() => setFormOpen(true)}
              className="text-[12px] font-semibold text-primary hover:underline"
            >
              Adicionar o primeiro artigo
            </button>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {entries.map(entry => {
              const info = tipoInfo(entry.tipo)
              return (
                <div key={entry.sourceId} className="group flex items-start gap-4 px-5 py-4 hover:bg-surface-container-low/40 transition-colors">
                  {/* Ícone de tipo */}
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                    <span className="material-symbols-outlined text-[16px] text-primary/70">{info?.icon ?? 'article'}</span>
                  </div>

                  {/* Conteúdo */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-semibold text-on-surface truncate">
                        {entry.titulo ?? 'Sem título'}
                      </p>
                      <button
                        onClick={() => handleDelete(entry.sourceId, entry.titulo)}
                        disabled={deletingId === entry.sourceId}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-error hover:bg-error/8 disabled:opacity-40"
                      >
                        {deletingId === entry.sourceId
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <span className="material-symbols-outlined text-[14px]">delete</span>}
                      </button>
                    </div>
                    <p className="mt-1 text-[12px] text-on-surface-variant/70 line-clamp-2">{entry.preview}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant/20 bg-surface-container-low px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
                        <span className="material-symbols-outlined text-[11px]">{info?.icon ?? 'article'}</span>
                        {info?.label ?? entry.tipo}
                      </span>
                      <span className="text-[11px] text-on-surface-variant/50">
                        {entry.totalChunks} chunk{entry.totalChunks !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[11px] text-on-surface-variant/50">
                        {new Date(entry.criadoEm).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Rodapé informativo */}
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/50 px-4 py-3 flex items-start gap-3">
        <span className="material-symbols-outlined text-[16px] text-primary/60 mt-0.5">info</span>
        <p className="text-[12px] text-on-surface-variant/70">
          Os artigos são automaticamente divididos em chunks e indexados com embeddings Voyage AI (voyage-3-lite).
          A IA usa essa base para responder perguntas no onboarding, CRM e portal do cliente.
        </p>
      </div>
    </div>
  )
}
