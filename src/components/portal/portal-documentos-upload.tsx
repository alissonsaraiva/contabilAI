'use client'

import { useRef, useState } from 'react'
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

export function PortalDocumentosUpload() {
  const router    = useRouter()
  const inputRef  = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tipo, setTipo]           = useState('outros')

  async function upload(file: File) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('tipo', tipo)
      const res = await fetch('/api/portal/documentos/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Erro ao enviar')
      }
      toast.success('Documento enviado com sucesso!')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao enviar arquivo')
    } finally {
      setUploading(false)
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    upload(files[0])
  }

  return (
    <Card
      className={`border-dashed border-2 rounded-[16px] p-6 transition-colors cursor-pointer ${
        dragging
          ? 'border-primary/60 bg-primary/5'
          : 'border-outline-variant/30 bg-surface-container-low/40 hover:border-primary/40 hover:bg-primary/3'
      }`}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.xml,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt"
        onChange={e => handleFiles(e.target.files)}
      />

      <div className="flex flex-col items-center gap-3 text-center" onClick={e => e.stopPropagation()}>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <span
            className="material-symbols-outlined text-[26px] text-primary"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            {uploading ? 'hourglass_empty' : 'cloud_upload'}
          </span>
        </div>
        <div>
          <p className="text-[14px] font-semibold text-on-surface">
            {uploading ? 'Enviando...' : 'Enviar documento'}
          </p>
          <p className="text-[12px] text-on-surface-variant/60 mt-0.5">
            Arraste e solte ou clique para selecionar · PDF, XML, imagens e mais
          </p>
        </div>

        {/* Tipo selector — stop propagation to not trigger file dialog */}
        <div
          className="flex flex-wrap items-center justify-center gap-2 mt-1"
          onClick={e => e.stopPropagation()}
        >
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
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-1 flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {uploading
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            : <span className="material-symbols-outlined text-[16px]">attach_file</span>
          }
          {uploading ? 'Enviando...' : 'Selecionar arquivo'}
        </button>
      </div>
    </Card>
  )
}
