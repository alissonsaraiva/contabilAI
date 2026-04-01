'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DocumentoPicker, type DocSistema } from '@/components/crm/documento-picker'

type ArquivoAnexo = {
  url: string
  type: 'image' | 'document'
  name: string
  mimeType: string
  previewUrl?: string
}

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
  const [arquivo, setArquivo] = useState<ArquivoAnexo | null>(null)
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
    removerArquivo()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!entidadeTipo || !entidadeId) {
      toast.error('Contato não identificado. Vincule a um cliente antes de fazer upload.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > 25 * 1024 * 1024) { toast.error('Arquivo muito grande. O limite é 25 MB.'); return }

    setUploading(true)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'outro', entidadeId, entidadeTipo, contentType: file.type }),
      })
      if (!res.ok) { toast.error('Tipo de arquivo não permitido'); return }
      const { uploadUrl, publicUrl } = await res.json() as { uploadUrl: string; publicUrl: string }
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      const isImage = file.type.startsWith('image/')
      setArquivo({
        url: publicUrl,
        type: isImage ? 'image' : 'document',
        name: file.name,
        mimeType: file.type,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      })
    } catch {
      toast.error('Erro ao fazer upload do arquivo')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleDocSistema(doc: DocSistema) {
    setArquivo({
      url:      doc.url,
      type:     'document',
      name:     doc.nome,
      mimeType: doc.mimeType ?? 'application/octet-stream',
    })
  }

  function removerArquivo() {
    if (arquivo?.previewUrl) URL.revokeObjectURL(arquivo.previewUrl)
    setArquivo(null)
  }

  async function enviar() {
    if ((!texto.trim() && !arquivo) || enviando) return
    setEnviando(true)
    try {
      await fetch(`/api/conversas/${conversaId}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto,
          ...(arquivo && {
            mediaUrl:      arquivo.url,
            mediaType:     arquivo.type,
            mediaFileName: arquivo.name,
            mediaMimeType: arquivo.mimeType,
          }),
        }),
      })
      setTexto('')
      removerArquivo()
      router.refresh()
    } finally {
      setEnviando(false)
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
        onSelect={handleDocSistema}
        clienteId={clienteId}
        leadId={leadId}
      />

      <div className="sticky bottom-0 border-t border-outline-variant/15 bg-card/95 backdrop-blur-md px-4 py-3">
        {/* Preview do arquivo anexado */}
        {arquivo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
            {arquivo.type === 'image' && arquivo.previewUrl ? (
              <img src={arquivo.previewUrl} alt="preview" className="h-10 w-10 rounded-lg object-cover shrink-0" />
            ) : (
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant shrink-0">attach_file</span>
            )}
            <span className="flex-1 truncate text-[12px] text-on-surface">{arquivo.name}</span>
            <button onClick={removerArquivo} className="shrink-0 text-on-surface-variant/50 hover:text-error transition-colors">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Input file oculto */}
          <input
            ref={fileInputRef}
            type="file"
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
            placeholder={arquivo ? 'Legenda (opcional)...' : canal === 'whatsapp' ? 'Digite sua mensagem...' : 'Digite sua resposta...'}
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
            disabled={(!texto.trim() && !arquivo) || enviando || uploading}
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
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
            Devolver para IA
          </button>
          <p className="text-[10px] text-on-surface-variant/40">
            Você está no controle · IA pausada · Shift+Enter para nova linha
          </p>
        </div>
      </div>
    </>
  )
}
