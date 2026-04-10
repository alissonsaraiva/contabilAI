'use client'

import { useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CATEGORIAS_DOCUMENTO } from '@/lib/services/documento-categorias'

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.xml'
const ACCEPT_EXTS = new Set(ACCEPT.split(',').map(e => e.toLowerCase()))
const MAX_CONCURRENT = 3

type FileStatus = { file: File; status: 'pending' | 'uploading' | 'done' | 'error' }

type EmpresaOption = { id: string; label: string }

type Props = {
  clienteId: string
  empresaId?: string
  /** Quando o cliente tem N > 1 empresas, passa a lista para o picker */
  empresas?: EmpresaOption[]
}

const INPUT_BASE = 'h-9 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] text-on-surface focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10'

export function DocumentoUpload({ clienteId, empresaId, empresas }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState('')
  const [categoria, setCategoria] = useState('geral')
  const [visivelPortal, setVisivelPortal] = useState(true)
  const [dataVencimento, setDataVencimento] = useState('')
  const [empresaSelecionada, setEmpresaSelecionada] = useState(empresaId ?? empresas?.[0]?.id ?? '')
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
    let rejectedSize = 0
    let rejectedType = 0
    for (const f of newFiles) {
      const ext = '.' + (f.name.split('.').pop()?.toLowerCase() ?? '')
      if (!ACCEPT_EXTS.has(ext)) { rejectedType++; continue }
      if (f.size > 25 * 1024 * 1024) { rejectedSize++; continue }
      valid.push(f)
    }
    if (rejectedType > 0) toast.error(`${rejectedType} arquivo(s) com tipo não permitido`)
    if (rejectedSize > 0) toast.error(`${rejectedSize} arquivo(s) excederam o limite de 25 MB`)
    if (valid.length === 0) return
    setFiles(prev => [...prev, ...valid.map(file => ({ file, status: 'pending' as const }))])
  }, [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list?.length) return
    addFiles(Array.from(list))
    if (fileRef.current) fileRef.current.value = ''
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
      fd.append('arquivo', file)
      fd.append('tipo', tipo.trim() || file.name)
      fd.append('categoria', categoria)
      const empId = empresaSelecionada || empresaId
      if (empId) fd.append('empresaId', empId)
      fd.append('visivelPortal', String(visivelPortal))
      if (dataVencimento) fd.append('dataVencimento', dataVencimento)
      const res = await fetch(`/api/crm/clientes/${clienteId}/documentos`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'done' } : f))
      return true
    } catch (err) {
      console.error('[documento-upload] falha ao enviar:', file.name, err)
      setFiles(prev => prev.map((f, i) => i === index ? { ...f, status: 'error' } : f))
      return false
    }
  }

  async function handleUpload() {
    const pending = files.map((f, i) => ({ ...f, index: i })).filter(f => f.status === 'pending' || f.status === 'error')
    if (pending.length === 0) return

    // Reset errors to pending for retry
    setFiles(prev => prev.map(f => f.status === 'error' ? { ...f, status: 'pending' } : f))
    setUploading(true)

    let ok = 0
    let fail = 0

    // Upload em lotes com concorrência limitada
    for (let i = 0; i < pending.length; i += MAX_CONCURRENT) {
      const batch = pending.slice(i, i + MAX_CONCURRENT)
      const results = await Promise.all(batch.map(f => uploadOne(f.file, f.index)))
      ok += results.filter(Boolean).length
      fail += results.filter(r => !r).length
    }

    setUploading(false)
    if (fail === 0) {
      toast.success(`${ok} documento${ok !== 1 ? 's' : ''} enviado${ok !== 1 ? 's' : ''}!`)
    } else {
      toast.error(`${fail} arquivo${fail !== 1 ? 's' : ''} falharam. Tente novamente.`)
    }
    router.refresh()
  }

  // Drag & drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length) addFiles(droppedFiles)
  }

  return (
    <div className="space-y-2.5">
      {/* Linha 1: campos + botão */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Nome / tipo (ex: Guia DAS)"
          value={tipo}
          onChange={e => setTipo(e.target.value)}
          className={INPUT_BASE + ' w-44 placeholder:text-on-surface-variant/40'}
        />
        <div className="relative">
          <select
            value={categoria}
            onChange={e => setCategoria(e.target.value)}
            className={INPUT_BASE + ' appearance-none pr-8 cursor-pointer'}
          >
            {CATEGORIAS_DOCUMENTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/40">expand_more</span>
        </div>

        {empresas && empresas.length > 1 && (
          <div className="relative">
            <select
              value={empresaSelecionada}
              onChange={e => setEmpresaSelecionada(e.target.value)}
              className={INPUT_BASE + ' appearance-none pr-8 cursor-pointer max-w-[180px] text-[12px]'}
              title="Empresa destino"
            >
              {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.label}</option>)}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/40">business</span>
          </div>
        )}

        <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-on-surface-variant/80">
          <input
            type="checkbox"
            checked={visivelPortal}
            onChange={e => { setVisivelPortal(e.target.checked); if (!e.target.checked) setDataVencimento('') }}
            className="h-3.5 w-3.5 rounded border-outline-variant/60 text-primary focus:ring-primary/30"
          />
          Portal
        </label>

        {visivelPortal && (
          <input
            type="date"
            value={dataVencimento}
            onChange={e => setDataVencimento(e.target.value)}
            className={INPUT_BASE + ' w-36 text-[12px] placeholder:text-on-surface-variant/40'}
            title="Vencimento (opcional)"
          />
        )}

        <label className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
          uploading ? 'bg-primary/50 text-white cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}>
          <span className="material-symbols-outlined text-[16px]">add</span>
          Arquivos
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            multiple
            disabled={uploading}
            onChange={handleFileInput}
            accept={ACCEPT}
          />
        </label>
      </div>

      {/* Drop zone — sempre visível quando arrastando ou com arquivos */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed transition-colors ${
          dragging
            ? 'border-primary bg-primary/5'
            : hasFiles
              ? 'border-outline-variant/20 bg-surface-container-low/30'
              : 'border-outline-variant/20 bg-transparent'
        } ${!hasFiles ? 'py-4' : 'py-2'} px-4`}
      >
        {!hasFiles ? (
          <p className="text-center text-[12px] text-on-surface-variant/50">
            <span className="material-symbols-outlined text-[16px] align-middle mr-1">cloud_upload</span>
            Arraste arquivos aqui ou clique em &quot;Arquivos&quot; acima
          </p>
        ) : (
          <div className="space-y-1.5">
            {files.map((f, i) => (
              <div key={`${f.file.name}-${i}`} className="flex items-center gap-2 text-[12px]">
                {f.status === 'uploading' && <span className="material-symbols-outlined animate-spin text-[14px] text-primary">progress_activity</span>}
                {f.status === 'done' && <span className="material-symbols-outlined text-[14px] text-green-status">check_circle</span>}
                {f.status === 'error' && <span className="material-symbols-outlined text-[14px] text-error">error</span>}
                {f.status === 'pending' && <span className="material-symbols-outlined text-[14px] text-on-surface-variant/40">draft</span>}
                <span className="flex-1 truncate text-on-surface/80">{f.file.name}</span>
                <span className="text-on-surface-variant/50">
                  {f.file.size < 1024 * 1024
                    ? `${(f.file.size / 1024).toFixed(0)} KB`
                    : `${(f.file.size / 1024 / 1024).toFixed(1)} MB`
                  }
                </span>
                {(f.status === 'pending' || f.status === 'error') && !uploading && (
                  <button onClick={() => removeFile(i)} className="text-on-surface-variant/40 hover:text-error transition-colors">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
              </div>
            ))}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/10">
              {!allDone && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {uploading
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    : <span className="material-symbols-outlined text-[14px]">upload</span>
                  }
                  {uploading ? 'Enviando...' : `Enviar ${pendingCount} arquivo${pendingCount !== 1 ? 's' : ''}`}
                </button>
              )}
              {allDone && (
                <span className="text-[12px] text-green-status font-semibold">
                  {successCount} enviado{successCount !== 1 ? 's' : ''}
                  {errorCount > 0 && <span className="text-error ml-1">· {errorCount} com erro</span>}
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
      </div>
    </div>
  )
}
