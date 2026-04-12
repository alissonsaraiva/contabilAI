'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'
import { DocumentoPicker, type DocSistema } from '@/components/crm/documento-picker'
import { inferMimeFromDoc, type ArquivoAnexo } from '@/components/crm/whatsapp-chat/use-whatsapp-chat'

type Props = {
  conversaId: string
  canal: string
  pausada: boolean
  entidadeTipo?: 'lead' | 'cliente'
  entidadeId?: string
}

export function ConversaRodape({ conversaId, canal, pausada, entidadeTipo, entidadeId }: Props) {
  const router = useRouter()
  const [assumido, setAssumido] = useState(pausada)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [arquivos, setArquivos] = useState<ArquivoAnexo[]>([])
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function assumir() {
    await fetch('/api/conversas/pausar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversaId }),
    })
    setAssumido(true)
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  async function devolverIA() {
    await fetch(`/api/conversas/${conversaId}/retomar`, { method: 'POST' })
    setAssumido(false)
    setTexto('')
    removerTodos()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (!entidadeTipo || !entidadeId) {
      toast.error('Contato não identificado. Vincule a um cliente antes de fazer upload.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    try {
      const novos: ArquivoAnexo[] = []
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) { toast.error(`"${file.name}" excede 25 MB.`); continue }
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'outro', entidadeId, entidadeTipo, contentType: file.type }),
        })
        if (!res.ok) { toast.error(`Tipo não permitido: ${file.name}`); continue }
        const { uploadUrl, publicUrl } = await res.json() as { uploadUrl: string; publicUrl: string }
        await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
        const isImage = file.type.startsWith('image/')
        novos.push({
          url: publicUrl,
          type: isImage ? 'image' : 'document',
          name: file.name,
          mimeType: file.type,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        })
      }
      if (novos.length > 0) setArquivos(prev => [...prev, ...novos])
    } catch (err) {
      toast.error('Erro ao fazer upload do arquivo')
      Sentry.captureException(err, {
        tags: { module: 'conversa-rodape', operation: 'upload' },
        extra: { conversaId },
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleDocsSistema(docs: DocSistema[]) {
    const novos = docs.map(doc => ({
      url:      doc.url,
      type:     (doc.mimeType?.startsWith('image/') ? 'image' : 'document') as 'image' | 'document',
      name:     doc.nome,
      mimeType: inferMimeFromDoc(doc.nome, doc.mimeType),
    }))
    setArquivos(prev => [...prev, ...novos])
  }

  function removerArquivo(index: number) {
    setArquivos(prev => {
      const copia = [...prev]
      const removed = copia.splice(index, 1)[0]
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return copia
    })
  }

  function removerTodos() {
    arquivos.forEach(a => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl) })
    setArquivos([])
  }

  async function enviar() {
    if ((!texto.trim() && arquivos.length === 0) || enviando) return
    setEnviando(true)
    try {
      if (arquivos.length > 0) {
        for (const arq of arquivos) {
          const res = await fetch(`/api/conversas/${conversaId}/mensagem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              texto: '',
              mediaUrl:      arq.url,
              mediaType:     arq.type,
              mediaFileName: arq.name,
              mediaMimeType: arq.mimeType,
            }),
          })
          if (!res.ok) {
            toast.error(`Falha ao enviar "${arq.name}"`)
          }
        }
        if (texto.trim()) {
          const res = await fetch(`/api/conversas/${conversaId}/mensagem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto }),
          })
          if (!res.ok) {
            toast.error('Erro ao enviar mensagem de texto')
          }
        }
      } else {
        const res = await fetch(`/api/conversas/${conversaId}/mensagem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto }),
        })
        if (!res.ok) {
          toast.error('Erro ao enviar mensagem')
          return
        }
      }
      setTexto('')
      removerTodos()
    } catch (err) {
      toast.error('Erro ao enviar mensagem')
      Sentry.captureException(err, {
        tags: { module: 'conversa-rodape', operation: 'enviar' },
        extra: { conversaId },
      })
    } finally {
      setEnviando(false)
      router.refresh()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  if (!assumido) {
    return (
      <div className="sticky bottom-0 border-t border-outline-variant/15 bg-card/95 backdrop-blur-md px-6 py-4">
        <button
          onClick={assumir}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-primary px-6 py-3.5 text-[14px] font-semibold text-white shadow-md hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            support_agent
          </span>
          Assumir controle desta conversa
        </button>
        {canal === 'whatsapp' && (
          <p className="mt-2 text-center text-[11px] text-on-surface-variant/50">
            A IA será pausada e você poderá responder diretamente
          </p>
        )}
      </div>
    )
  }

  const clienteId = entidadeTipo === 'cliente' ? entidadeId : undefined
  const leadId    = entidadeTipo === 'lead'    ? entidadeId : undefined

  return (
    <>
      {/* Picker de arquivos do sistema */}
      <DocumentoPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectMultiple={handleDocsSistema}
        multiSelect
        clienteId={clienteId}
        leadId={leadId}
      />

      <div className="sticky bottom-0 border-t border-outline-variant/15 bg-card/95 backdrop-blur-md px-4 py-3">
        {/* Preview dos arquivos anexados */}
        {arquivos.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {arquivos.map((arq, i) => (
              <div key={`${arq.url}-${arq.name}`} className="flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-2.5 py-1.5 max-w-[200px]">
                {arq.type === 'image' && arq.previewUrl ? (
                  <img src={arq.previewUrl} alt="preview" className="h-7 w-7 rounded-lg object-cover shrink-0" />
                ) : (
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">attach_file</span>
                )}
                <span className="flex-1 truncate text-[11px] text-on-surface">{arq.name}</span>
                <button onClick={() => removerArquivo(i)} className="shrink-0 text-on-surface-variant/50 hover:text-error transition-colors ml-0.5">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Input file oculto */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*,text/plain,text/csv"
            onChange={handleFileChange}
          />

          {/* Botões de anexo */}
          <div className="flex shrink-0 gap-1">
            {/* Upload novo arquivo */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-40 transition-all"
              title={entidadeTipo && entidadeId ? 'Fazer upload de arquivo' : 'Vincule o contato a um cliente para fazer upload'}
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-on-surface-variant" />
              ) : (
                <span className="material-symbols-outlined text-[20px]">attach_file</span>
              )}
            </button>

            {/* Arquivos do sistema */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={uploading}
              className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-40 transition-all"
              title={entidadeTipo && entidadeId ? 'Arquivos do sistema' : 'Buscar documentos de um cliente'}
            >
              <span className="material-symbols-outlined text-[20px]">folder_open</span>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={arquivos.length > 0 ? 'Legenda (opcional)...' : canal === 'whatsapp' ? 'Digite sua mensagem...' : 'Digite sua resposta...'}
            rows={1}
            className="flex-1 resize-none rounded-[12px] border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-[13px] text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none focus:ring-[3px] focus:ring-primary/10 max-h-40 overflow-y-auto"
            style={{ minHeight: '44px' }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`
            }}
          />
          <button
            onClick={enviar}
            disabled={(!texto.trim() && arquivos.length === 0) || enviando || uploading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-primary text-white shadow-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {enviando ? 'hourglass_empty' : 'send'}
            </span>
          </button>
        </div>
        <div className="mt-2 flex items-center gap-3 px-1">
          <button
            onClick={devolverIA}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            Devolver para IA
          </button>
          <p className="text-[10px] text-on-surface-variant/40">
            Você está no controle · IA pausada<span className="hidden sm:inline"> · Shift+Enter para nova linha</span>
          </p>
        </div>
      </div>
    </>
  )
}
