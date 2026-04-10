'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import {
  CATEGORIAS_LABELS,
  STATUS_DOCUMENTO_COLORS,
  ORIGEM_DOCUMENTO_COLORS,
  ORIGEM_DOCUMENTO_LABELS,
} from '@/lib/services/documento-categorias'

export type Documento = {
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
  resumoStatus?: string | null
  visivelPortal: boolean
  observacao?: string | null
  visualizadoEm?: string | Date | null
  dataVencimento?: string | Date | null
}

type Props = {
  doc: Documento
  selected?: boolean
  onToggleSelect?: (id: string) => void
  onUpdate: (doc: Partial<Documento> & { id: string }) => void
  onDelete: (id: string) => void
  onEdit: (doc: Documento) => void
  onPreview: (doc: Documento) => void
}

export function getDocIcon(mime: string | null, nome: string): string {
  const ext = nome.split('.').pop()?.toLowerCase() ?? ''
  if (mime === 'application/pdf' || ext === 'pdf') return 'picture_as_pdf'
  if (mime?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
  if (mime?.includes('xml') || ext === 'xml') return 'code'
  if (mime?.includes('spreadsheet') || mime?.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'table_chart'
  if (mime?.includes('word') || ['doc', 'docx'].includes(ext)) return 'article'
  if (mime?.includes('zip') || ['zip', 'rar', '7z'].includes(ext)) return 'folder_zip'
  return 'description'
}

export function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('pt-BR')
}

export type VencimentoInfo = {
  dias: number
  label: string
  color: string
} | null

export function getVencimentoInfo(dataVencimento?: string | Date | null): VencimentoInfo {
  if (!dataVencimento) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(dataVencimento)
  venc.setHours(0, 0, 0, 0)
  const diff = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) {
    return { dias: diff, label: 'Vencido', color: 'bg-error/10 text-error' }
  }
  if (diff === 0) {
    return { dias: 0, label: 'Vence hoje', color: 'bg-error/10 text-error' }
  }
  if (diff <= 5) {
    return { dias: diff, label: `Vence em ${diff}d`, color: 'bg-orange-status/10 text-orange-status' }
  }
  if (diff <= 15) {
    return { dias: diff, label: `Vence em ${diff}d`, color: 'bg-primary/10 text-primary' }
  }
  return { dias: diff, label: `Vence ${venc.toLocaleDateString('pt-BR')}`, color: 'bg-surface-container text-on-surface-variant/70' }
}

export function canPreview(mime: string | null, nome: string): boolean {
  const isPdf = mime === 'application/pdf' || nome.toLowerCase().endsWith('.pdf')
  const isImage = !!mime?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(nome)
  return isPdf || isImage
}

export function DocumentoRow({ doc, selected, onToggleSelect, onUpdate, onDelete, onEdit, onPreview }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(doc.nome)
  const [confirmandoDelete, setConfirmandoDelete] = useState(false)
  const [deletando, setDeletando] = useState(false)
  const [togglingVisibility, setTogglingVisibility] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const renamingRef = useRef(false)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  async function handleRename() {
    if (renamingRef.current) return
    renamingRef.current = true
    const trimmed = newName.trim()
    if (!trimmed || trimmed === doc.nome) { setRenaming(false); renamingRef.current = false; return }
    try {
      const res = await fetch(`/api/crm/documentos/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: trimmed }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onUpdate(updated)
      toast.success('Nome atualizado')
    } catch {
      toast.error('Erro ao renomear')
      setNewName(doc.nome)
    }
    setRenaming(false)
    renamingRef.current = false
  }

  async function handleToggleVisibility() {
    setTogglingVisibility(true)
    try {
      const res = await fetch(`/api/crm/documentos/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visivelPortal: !doc.visivelPortal }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      onUpdate(updated)
      toast.success(updated.visivelPortal ? 'Disponibilizado no portal' : 'Removido do portal')
    } catch {
      toast.error('Erro ao alterar visibilidade')
    } finally {
      setTogglingVisibility(false)
    }
  }

  async function handleDelete() {
    setDeletando(true)
    try {
      const res = await fetch(`/api/crm/documentos/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      onDelete(doc.id)
      toast.success('Documento removido')
    } catch {
      toast.error('Erro ao remover documento')
    } finally {
      setDeletando(false)
      setConfirmandoDelete(false)
    }
  }

  const icon = getDocIcon(doc.mimeType, doc.nome)
  const xmlMeta = doc.xmlMetadata as any
  const isXML = doc.mimeType?.includes('xml') || doc.nome.toLowerCase().endsWith('.xml')
  const previewable = canPreview(doc.mimeType, doc.nome)
  const naoVistoPeloCliente = doc.origem === 'crm' && doc.visivelPortal && !doc.visualizadoEm

  // Vencimento
  const vencimentoInfo = getVencimentoInfo(doc.dataVencimento)

  return (
    <div className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${selected ? 'bg-primary/[0.04]' : 'hover:bg-surface-container-low/20'}`}>
      {/* Checkbox de seleção */}
      {onToggleSelect && (
        <div className="mt-1.5 shrink-0">
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect(doc.id)}
            className="h-3.5 w-3.5 rounded border-outline-variant/60 text-primary focus:ring-primary/30 cursor-pointer"
          />
        </div>
      )}

      {/* Ícone */}
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isXML ? 'bg-primary/10' : 'bg-surface-container'}`}>
        <span
          className={`material-symbols-outlined text-[18px] ${isXML ? 'text-primary' : 'text-on-surface-variant/60'}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        {/* Nome (editável inline) */}
        {renaming ? (
          <input
            ref={inputRef}
            className="h-6 w-full rounded border border-primary/40 bg-surface-container px-1.5 text-[13px] font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setNewName(doc.nome); setRenaming(false) } }}
          />
        ) : (
          <button
            onClick={() => { setNewName(doc.nome); setRenaming(true) }}
            className="text-left text-[13px] font-medium text-on-surface truncate max-w-full hover:text-primary transition-colors cursor-text"
            title="Clique para renomear"
          >
            {doc.nome}
          </button>
        )}

        {/* Metadados */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[11px] text-on-surface-variant/60">
            {doc.tipo}
            {doc.categoria ? ` · ${CATEGORIAS_LABELS[doc.categoria] ?? doc.categoria}` : ''}
            {doc.tamanho ? ` · ${formatSize(doc.tamanho)}` : ''}
            {` · ${formatDate(doc.criadoEm)}`}
          </span>
        </div>

        {/* XML metadata */}
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

      {/* Badges + ações */}
      <div className="flex shrink-0 items-center gap-1.5 flex-wrap justify-end">
        {/* Badge interno */}
        {!doc.visivelPortal && (
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/70">
            Interno
          </span>
        )}

        {/* Badge vencimento */}
        {vencimentoInfo && (
          <span
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${vencimentoInfo.color}`}
            title={doc.dataVencimento ? `Vencimento: ${new Date(doc.dataVencimento).toLocaleDateString('pt-BR')}` : ''}
          >
            <span className="material-symbols-outlined text-[11px]">schedule</span>
            {vencimentoInfo.label}
          </span>
        )}

        {/* Badge não visto pelo cliente */}
        {naoVistoPeloCliente && (
          <span className="flex items-center gap-0.5 rounded-full bg-orange-status/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-status" title="Cliente ainda não visualizou este documento">
            <span className="material-symbols-outlined text-[11px]">mark_email_unread</span>
            Não visto
          </span>
        )}

        {/* Origem */}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ORIGEM_DOCUMENTO_COLORS[doc.origem] ?? 'bg-surface-container text-on-surface-variant'}`}>
          {ORIGEM_DOCUMENTO_LABELS[doc.origem] ?? doc.origem}
        </span>

        {/* Status */}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_DOCUMENTO_COLORS[doc.status] ?? 'bg-surface-container text-on-surface-variant'}`}>
          {doc.status}
        </span>

        {/* Resumo IA badges */}
        {doc.resumoStatus === 'esgotado' && (
          <span title="Falha no processamento IA após 3 tentativas" className="flex items-center gap-0.5 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-error">
            <span className="material-symbols-outlined text-[11px]">error</span>
            IA falhou
          </span>
        )}
        {doc.resumoStatus === 'falhou' && (
          <span title="Falha no processamento IA — aguardando retry" className="flex items-center gap-0.5 rounded-full bg-orange-status/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-status">
            <span className="material-symbols-outlined text-[11px]">sync_problem</span>
            Retry
          </span>
        )}
        {doc.resumoStatus === 'processando' && (
          <span title="Gerando resumo IA..." className="flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            <span className="material-symbols-outlined animate-spin text-[11px]">progress_activity</span>
            IA
          </span>
        )}

        {/* Toggle visibilidade portal */}
        <button
          onClick={handleToggleVisibility}
          disabled={togglingVisibility}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            doc.visivelPortal
              ? 'text-primary/70 hover:bg-primary/10 hover:text-primary'
              : 'text-on-surface-variant/40 hover:bg-surface-container hover:text-on-surface-variant'
          }`}
          title={doc.visivelPortal ? 'Visível no portal — clique para ocultar' : 'Oculto do portal — clique para disponibilizar'}
        >
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: doc.visivelPortal ? "'FILL' 1" : "'FILL' 0" }}>
            {doc.visivelPortal ? 'visibility' : 'visibility_off'}
          </span>
        </button>

        {/* Preview (só PDF/imagem) */}
        {previewable && (
          <button
            onClick={() => onPreview(doc)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
            title="Visualizar"
          >
            <span className="material-symbols-outlined text-[16px]">preview</span>
          </button>
        )}

        {/* Download */}
        <a
          href={`/api/crm/documentos/${doc.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
          title="Download"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
        </a>

        {/* Editar */}
        <button
          onClick={() => onEdit(doc)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
          title="Editar documento"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>

        {/* Deletar */}
        {confirmandoDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={deletando}
              className="flex h-7 items-center gap-1 rounded-lg bg-error/10 px-2 text-[11px] font-semibold text-error hover:bg-error/20 transition-colors disabled:opacity-50"
            >
              {deletando && <span className="h-3 w-3 animate-spin rounded-full border border-error/30 border-t-error" />}
              Confirmar
            </button>
            <button
              onClick={() => setConfirmandoDelete(false)}
              className="flex h-7 items-center rounded-lg px-2 text-[11px] text-on-surface-variant/50 hover:bg-surface-container transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmandoDelete(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/40 hover:bg-error/10 hover:text-error transition-colors"
            title="Remover documento"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        )}
      </div>
    </div>
  )
}
