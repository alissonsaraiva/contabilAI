'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RagDiagnostico } from '@/components/crm/rag-diagnostico'

type CanalRAG = 'onboarding' | 'crm' | 'portal' | 'whatsapp' | 'geral'
type TipoConhecimento = 'base_conhecimento' | 'fiscal_normativo' | 'template'

type KnowledgeEntry = {
  sourceId: string
  canal: CanalRAG
  tipo: TipoConhecimento
  titulo: string | null
  preview: string
  totalChunks: number
  criadoEm: string
}

const CANAIS: { value: CanalRAG; label: string; icon: string; desc: string }[] = [
  { value: 'onboarding', icon: 'chat_bubble',   label: 'Onboarding',  desc: 'Triagem de novos leads — planos, processo de abertura' },
  { value: 'crm',        icon: 'support_agent', label: 'CRM',         desc: 'Base interna do contador — normas, procedimentos' },
  { value: 'portal',     icon: 'person',         label: 'Portal',      desc: 'Atendimento ao cliente — obrigações, prazos, docs' },
  { value: 'whatsapp',   icon: 'chat',           label: 'WhatsApp',    desc: 'Respostas rápidas via WhatsApp' },
  { value: 'geral',      icon: 'public',         label: 'Geral',       desc: 'Aparece em todos os canais' },
]

const TIPOS: { value: TipoConhecimento; label: string }[] = [
  { value: 'base_conhecimento', label: 'Base de Conhecimento' },
  { value: 'fiscal_normativo',  label: 'Fiscal / Normativo' },
  { value: 'template',          label: 'Template' },
]

const INPUT = 'w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

export default function ConhecimentoPage() {
  const [activeCanal, setActiveCanal] = useState<CanalRAG>('onboarding')
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pdfOpen, setPdfOpen]   = useState(false)
  const [seeding, setSeeding]   = useState(false)
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ sourceId: string; titulo: string | null } | null>(null)

  // Form texto
  const [titulo, setTitulo]     = useState('')
  const [conteudo, setConteudo] = useState('')
  const [tipo, setTipo]         = useState<TipoConhecimento>('base_conhecimento')
  const [saving, setSaving]     = useState(false)

  // Form PDF
  const [pdfFile, setPdfFile]     = useState<File | null>(null)
  const [pdfTitulo, setPdfTitulo] = useState('')
  const [pdfTipo, setPdfTipo]     = useState<TipoConhecimento>('base_conhecimento')
  const [uploadingPdf, setUploadingPdf] = useState(false)

  const loadEntries = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetch(`/api/conhecimento?canal=${activeCanal}`)
      if (!res.ok) throw new Error()
      setEntries(await res.json())
    } catch {
      toast.error('Erro ao carregar base de conhecimento')
    } finally {
      setLoadingList(false)
    }
  }, [activeCanal])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Fecha forms ao trocar de canal
  useEffect(() => { setFormOpen(false); setPdfOpen(false) }, [activeCanal])

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
        body: JSON.stringify({ titulo: titulo.trim(), conteudo: conteudo.trim(), tipo, canal: activeCanal }),
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

  async function handleSeed() {
    setSeeding(true)
    try {
      const res = await fetch('/api/rag/seed', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`RAG re-indexado: escritório, planos, ${data.clientes} clientes, ${data.leads} leads`)
      loadEntries()
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao re-indexar')
    } finally {
      setSeeding(false)
    }
  }

  async function handlePdfUpload() {
    if (!pdfFile) { toast.error('Selecione um arquivo PDF'); return }
    if (!pdfTitulo.trim()) { toast.error('Informe um título'); return }
    setUploadingPdf(true)
    try {
      const form = new FormData()
      form.append('file', pdfFile)
      form.append('titulo', pdfTitulo.trim())
      form.append('canal', activeCanal)
      form.append('tipo', pdfTipo)
      const res = await fetch('/api/conhecimento/pdf', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`PDF indexado: ${data.chunks} chunks · ${data.pages} página(s)`)
      setPdfFile(null); setPdfTitulo(''); setPdfTipo('base_conhecimento')
      setPdfOpen(false)
      loadEntries()
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao processar PDF')
    } finally {
      setUploadingPdf(false)
    }
  }

  async function handleDelete(sourceId: string, titulo: string | null) {
    setConfirmDelete({ sourceId, titulo })
  }

  async function executeDelete(sourceId: string) {
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
      setConfirmDelete(null)
    }
  }

  const canalInfo = CANAIS.find(c => c.value === activeCanal)!

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_stories
              </span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface">Base de Conhecimento</h3>
              <p className="text-[12px] text-on-surface-variant/80">Cada IA acessa apenas a base do seu canal + Geral</p>
            </div>
          </div>
          <button
            onClick={() => setConfirmSeed(true)}
            disabled={seeding}
            className="flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[12px] font-semibold text-on-surface-variant hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50"
            title="Re-indexa escritório, planos, clientes e leads no RAG"
          >
            {seeding
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <span className="material-symbols-outlined text-[15px]">sync</span>}
            Re-indexar dados
          </button>
        </div>
      </div>

      {/* Tabs de canal */}
      <div className="flex overflow-x-auto gap-2 pb-1 custom-scrollbar">
        {CANAIS.map(c => (
          <button
            key={c.value}
            onClick={() => setActiveCanal(c.value)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition-all',
              activeCanal === c.value
                ? 'border-primary/30 bg-primary/8 text-primary shadow-sm'
                : 'border-outline-variant/20 bg-card text-on-surface-variant hover:border-outline-variant/40 hover:text-on-surface',
            )}
          >
            <span className="material-symbols-outlined text-[15px]"
              style={{ fontVariationSettings: activeCanal === c.value ? "'FILL' 1" : "'FILL' 0" }}>
              {c.icon}
            </span>
            {c.label}
          </button>
        ))}
      </div>

      {/* Descrição do canal + botões */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-on-surface-variant/70">
          <span className="material-symbols-outlined text-[14px]">{canalInfo.icon}</span>
          {canalInfo.desc}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => { setPdfOpen(o => !o); setFormOpen(false) }}
            className="flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-card px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:border-primary/30 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">{pdfOpen ? 'close' : 'picture_as_pdf'}</span>
            {pdfOpen ? 'Cancelar' : 'Upload PDF'}
          </button>
          <button
            onClick={() => { setFormOpen(o => !o); setPdfOpen(false) }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">{formOpen ? 'close' : 'add'}</span>
            {formOpen ? 'Cancelar' : 'Novo artigo'}
          </button>
        </div>
      </div>

      {/* Formulário PDF */}
      {pdfOpen && (
        <div className="space-y-4 rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Título <span className="text-error">*</span></label>
              <input
                value={pdfTitulo}
                onChange={e => setPdfTitulo(e.target.value)}
                className={INPUT}
                placeholder="Ex: Tabela SIMPLES Nacional 2025"
              />
            </div>
            <div>
              <label className={LABEL}>Tipo</label>
              <select
                value={pdfTipo}
                onChange={e => setPdfTipo(e.target.value as TipoConhecimento)}
                className={`${INPUT} cursor-pointer`}
              >
                {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Arquivo PDF <span className="text-error">*</span></label>
            <label className={cn(
              'flex cursor-pointer items-center gap-3 rounded-[10px] border-2 border-dashed px-4 py-5 transition-colors',
              pdfFile ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/30 hover:border-primary/30 hover:bg-surface-container-low/50',
            )}>
              <span className="material-symbols-outlined text-[22px] text-primary/60">picture_as_pdf</span>
              <div className="flex-1 min-w-0">
                {pdfFile ? (
                  <>
                    <p className="truncate text-[13px] font-semibold text-on-surface">{pdfFile.name}</p>
                    <p className="text-[11px] text-on-surface-variant">{(pdfFile.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <p className="text-[13px] text-on-surface-variant">Clique para selecionar um PDF</p>
                )}
              </div>
              {pdfFile && (
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); setPdfFile(null) }}
                  className="shrink-0 text-on-surface-variant hover:text-error"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-1 text-[11px] text-on-surface-variant/50">
              O texto é extraído automaticamente e dividido em chunks para busca semântica
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handlePdfUpload}
              disabled={uploadingPdf || !pdfFile}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {uploadingPdf
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <span className="material-symbols-outlined text-[16px]">cloud_upload</span>}
              {uploadingPdf ? 'Processando...' : 'Processar e indexar'}
            </button>
          </div>
        </div>
      )}

      {/* Formulário de criação (texto) */}
      {formOpen && (
        <div className="space-y-4 rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Título</label>
              <input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                className={INPUT}
                placeholder={
                  activeCanal === 'onboarding' ? 'Ex: Como funciona o MEI?' :
                  activeCanal === 'crm'        ? 'Ex: Procedimento DAS atrasado' :
                  activeCanal === 'portal'     ? 'Ex: Quando vence meu DAS?' :
                  activeCanal === 'whatsapp'   ? 'Ex: Horário de atendimento' :
                  'Ex: Política de atendimento'
                }
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
              placeholder="Cole ou escreva o conteúdo. O sistema divide automaticamente em chunks otimizados para busca semântica."
            />
            <p className="mt-1 text-[11px] text-on-surface-variant/50">
              {conteudo.length} chars · ~{Math.ceil(conteudo.length / 1600) || 1} chunk(s)
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

      {/* Lista de artigos */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        {loadingList ? (
          <div className="flex items-center justify-center py-16 gap-3 text-on-surface-variant">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[13px]">Carregando...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-[40px] opacity-30">{canalInfo.icon}</span>
            <p className="text-[13px]">Nenhum artigo para <strong>{canalInfo.label}</strong></p>
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
              const tipoInfo = TIPOS.find(t => t.value === entry.tipo)
              return (
                <div key={entry.sourceId} className="group flex items-start gap-4 px-5 py-4 hover:bg-surface-container-low/40 transition-colors">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                    <span className="material-symbols-outlined text-[16px] text-primary/70">{canalInfo.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-semibold text-on-surface truncate">
                        {entry.titulo ?? 'Sem título'}
                      </p>
                      <button
                        onClick={() => handleDelete(entry.sourceId, entry.titulo)}
                        disabled={deletingId === entry.sourceId}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center rounded-lg px-2 py-1 text-[11px] font-medium text-error hover:bg-error/8 disabled:opacity-40"
                      >
                        {deletingId === entry.sourceId
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <span className="material-symbols-outlined text-[14px]">delete</span>}
                      </button>
                    </div>
                    <p className="mt-1 text-[12px] text-on-surface-variant/70 line-clamp-2">{entry.preview}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant/20 bg-surface-container-low px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
                        {tipoInfo?.label ?? entry.tipo}
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

      {/* Info */}
      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/50 px-4 py-3 flex items-start gap-3">
        <span className="material-symbols-outlined text-[16px] text-primary/60 mt-0.5">info</span>
        <p className="text-[12px] text-on-surface-variant/70">
          Artigos do canal <strong>Geral</strong> aparecem em todos os canais.
          Cada IA acessa apenas os artigos do seu canal + Geral — o onboarding não vê a base do portal, e vice-versa.
        </p>
      </div>

      {/* Diagnóstico de qualidade do RAG */}
      <RagDiagnostico />

      <ConfirmDialog
        open={confirmSeed}
        onClose={() => setConfirmSeed(false)}
        onConfirm={() => { setConfirmSeed(false); handleSeed() }}
        title="Re-indexar dados no RAG?"
        description="Isso re-sincroniza escritório, planos, clientes, leads, tarefas e escalações com o banco vetorial. Pode demorar alguns segundos."
        confirmLabel="Re-indexar"
        variant="default"
        loading={seeding}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { if (confirmDelete) executeDelete(confirmDelete.sourceId) }}
        title="Remover artigo?"
        description={`"${confirmDelete?.titulo ?? confirmDelete?.sourceId}" e todos os seus chunks serão deletados permanentemente.`}
        confirmLabel="Remover"
        loading={!!deletingId}
      />
    </div>
  )
}
