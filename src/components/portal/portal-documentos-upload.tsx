'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'

const TIPO_OPTIONS = [
  { value: 'nota_fiscal',  label: 'Nota Fiscal' },
  { value: 'contrato',     label: 'Contrato' },
  { value: 'extrato',      label: 'Extrato bancário' },
  { value: 'boleto',       label: 'Boleto' },
  { value: 'holerite',     label: 'Holerite' },
  { value: 'outros',       label: 'Outros' },
]

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.xml'
const ACCEPT_EXTS = new Set(ACCEPT.split(',').map(e => e.toLowerCase()))
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB (portal)
const MAX_CONCURRENT = 3

type FileStatus = { file: File; status: 'pending' | 'uploading' | 'done' | 'error'; errorMsg?: string }

export function PortalDocumentosUpload() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState('outros')
  const [files, setFiles] = useState<FileStatus[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  const hasFiles = files.length > 0
  const pendingCount = files.filter(f => f.status === 'pending' || f.status === 'error').length
  const successCount = files.filter(f => f.status === 'done').length
  const errorCount = files.filter(f => f.status === 'error').length
  const allDone = hasFiles && pendingCount === 0 && !uploading

  const addFiles = useCallback((newFiles: File[]) => {
    const valid: File[] = []
    let rejectedType = 0
    let rejectedSize = 0
    for (const f of newFiles) {
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '')
      if (!ACCEPT_EXTS.has(ext)) { rejectedType++; continue }
      if (f.size > MAX_SIZE) { rejectedSize++; continue }
      valid.push(f)
    }
    if (rejectedType > 0) toast.error(`${rejectedType} arquivo(s) não aceito(s). Use PDF, XML, imagens, planilhas ou documentos de texto.`)
    if (rejectedSize > 0) toast.error(`${rejectedSize} arquivo(s) supera(m) o limite de 10 MB. Reduza o tamanho e tente novamente.`)
    if (valid.length === 0) return
    setFiles(prev => [...prev, ...valid.map(file => ({ file, status: 'pending' as const }))])
  }, [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list?.length) return
    addFiles(Array.from(list))
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  function clearAll() {
    setFiles([])
  }

  async function uploadOne(file: File, index: number): Promise<boolean> {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'uploading' } : f))
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tipo', tipo)
      const res = await fetch('/api/portal/documentos/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Não foi possível enviar o arquivo.')
      }
      setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'done' } : f))
      return true
    } catch (err) {
      setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', errorMsg: 'Não foi possível enviar o arquivo. Tente novamente.' } : f))
      return false
    }
  }

  async function handleUpload() {
    const pending = files.map((f, i) => ({ ...f, index: i })).filter(f => f.status === 'pending' || f.status === 'error')
    if (pending.length === 0) return

    setFiles(prev => prev.map(f => f.status === 'error' ? { ...f, status: 'pending', errorMsg: undefined } : f))
    setUploading(true)

    let ok = 0
    let fail = 0
    for (let i = 0; i < pending.length; i += MAX_CONCURRENT) {
      const batch = pending.slice(i, i + MAX_CONCURRENT)
      const results = await Promise.all(batch.map(f => uploadOne(f.file, f.index)))
      ok += results.filter(Boolean).length
      fail += results.filter(r => !r).length
    }

    setUploading(false)
    if (fail === 0) {
      toast.success(`${ok} documento${ok !== 1 ? 's' : ''} enviado${ok !== 1 ? 's' : ''} com sucesso!`)
    } else {
      toast.error(`${fail} arquivo${fail !== 1 ? 's' : ''} não ${fail !== 1 ? 'foram enviados' : 'foi enviado'}. Tente novamente.`)
    }
    router.refresh()
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <Card
      className={`border-dashed border-2 rounded-[16px] p-6 transition-colors ${
        !hasFiles ? 'cursor-pointer' : ''
      } ${
        dragging
          ? 'border-primary/60 bg-primary/5'
          : 'border-outline-variant/30 bg-surface-container-low/40 hover:border-primary/40'
      }`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
      onClick={() => !hasFiles && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept={ACCEPT}
        onChange={handleFileInput}
      />

      {!hasFiles ? (
        /* Estado vazio — área de drop */
        <div className="flex flex-col items-center gap-3 text-center" onClick={e => e.stopPropagation()}>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[26px] text-primary" style={{ fontVariationSettings: "'FILL' 0" }}>
              cloud_upload
            </span>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-on-surface">Enviar documento</p>
            <p className="text-[12px] text-on-surface-variant/60 mt-0.5">
              Arraste e solte ou clique para selecionar · PDF, XML, imagens · Máx 10 MB
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Tipo:</span>
            {TIPO_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTipo(opt.value)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                  tipo === opt.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-1 flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">attach_file</span>
            Selecionar arquivos
          </button>
        </div>
      ) : (
        /* Estado com arquivos — lista + ações */
        <div className="space-y-2" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-on-surface-variant/70">
              {files.length} arquivo{files.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-[12px] font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
            >
              + Adicionar mais
            </button>
          </div>

          {files.map((f, i) => (
            <div key={`${f.file.name}-${i}`} className="flex items-center gap-2 text-[12px]">
              {f.status === 'uploading' && <span className="material-symbols-outlined animate-spin text-[14px] text-primary">progress_activity</span>}
              {f.status === 'done' && <span className="material-symbols-outlined text-[14px] text-green-600">check_circle</span>}
              {f.status === 'error' && <span className="material-symbols-outlined text-[14px] text-red-600">error</span>}
              {f.status === 'pending' && <span className="material-symbols-outlined text-[14px] text-on-surface-variant/40">draft</span>}
              <span className="flex-1 truncate text-on-surface/80">{f.file.name}</span>
              <span className="text-on-surface-variant/50 shrink-0">{formatFileSize(f.file.size)}</span>
              {(f.status === 'pending' || f.status === 'error') && !uploading && (
                <button onClick={() => removeFile(i)} aria-label={`Remover ${f.file.name}`} className="text-on-surface-variant/40 hover:text-red-600 transition-colors">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>
          ))}

          {/* Tipo selector */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/10">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50">Tipo:</span>
            {TIPO_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTipo(opt.value)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                  tipo === opt.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 pt-1">
            {!allDone && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {uploading
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  : <span className="material-symbols-outlined text-[16px]">upload</span>
                }
                {uploading ? 'Enviando...' : `Enviar ${pendingCount} arquivo${pendingCount !== 1 ? 's' : ''}`}
              </button>
            )}
            {allDone && (
              <span className="text-[13px] text-green-600 font-semibold">
                {successCount} enviado{successCount !== 1 ? 's' : ''}
                {errorCount > 0 && <span className="text-red-600 ml-1">· {errorCount} com erro</span>}
              </span>
            )}
            <button
              onClick={clearAll}
              disabled={uploading}
              className="text-[12px] text-on-surface-variant/50 hover:text-on-surface-variant transition-colors disabled:opacity-50"
            >
              Limpar
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
