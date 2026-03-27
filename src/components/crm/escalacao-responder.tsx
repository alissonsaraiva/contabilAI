'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type ArquivoAnexo = {
  url: string
  type: 'image' | 'document'
  name: string
  mimeType: string
  previewUrl?: string
}

type Props = {
  escalacaoId: string
  canal: string
  nomeIa?: string
  /** ID da entidade (lead ou cliente) necessário para upload */
  entidadeId?: string
  entidadeTipo?: 'lead' | 'cliente'
}

type Modo = 'ia' | 'direto'

export function EscalacaoResponder({ escalacaoId, canal, nomeIa = 'Clara', entidadeId, entidadeTipo }: Props) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo>('ia')
  const [conteudo, setConteudo] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [mensagemEnviada, setMensagemEnviada] = useState('')
  const [arquivo, setArquivo] = useState<ArquivoAnexo | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canalLabel = canal === 'whatsapp' ? 'WhatsApp' : 'widget do site'
  const podeAnexar = modo === 'direto' && canal === 'whatsapp' && !!entidadeId && !!entidadeTipo

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!entidadeTipo || !entidadeId) { toast.error('Entidade não identificada para upload'); return }

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

  function removerArquivo() {
    if (arquivo?.previewUrl) URL.revokeObjectURL(arquivo.previewUrl)
    setArquivo(null)
  }

  async function handleEnviar() {
    if ((!conteudo.trim() && !arquivo) || loading) return
    setLoading(true)
    setErro('')
    try {
      const res = await fetch(`/api/escalacoes/${escalacaoId}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo,
          conteudo,
          ...(arquivo && {
            mediaUrl:      arquivo.url,
            mediaType:     arquivo.type,
            mediaFileName: arquivo.name,
            mediaMimeType: arquivo.mimeType,
          }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar')
      setMensagemEnviada(data.mensagemEnviada)
      setEnviado(true)
      removerArquivo()
      router.refresh()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar')
    } finally {
      setLoading(false)
    }
  }

  if (enviado) {
    return (
      <div className="rounded-[14px] border border-green-status/20 bg-green-status/5 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <span className="material-symbols-outlined text-[20px] text-green-status"
            style={{ fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
          <h2 className="font-headline text-base font-semibold text-on-surface">
            Mensagem enviada para {canalLabel}
          </h2>
        </div>
        <p className="text-[13px] text-on-surface whitespace-pre-wrap">{mensagemEnviada}</p>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm space-y-5">
      <h2 className="font-headline text-base font-semibold text-on-surface flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-primary"
          style={{ fontVariationSettings: "'FILL' 1" }}>
          reply
        </span>
        Responder via {canalLabel}
      </h2>

      {/* Selector de modo */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setModo('ia')}
          className={`flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all ${
            modo === 'ia'
              ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
              : 'border-outline-variant/20 hover:bg-surface-container'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}>
              smart_toy
            </span>
            <span className="text-[13px] font-semibold text-on-surface">Orientar {nomeIa}</span>
          </div>
          <p className="text-[11px] text-on-surface-variant">
            {nomeIa} reformula sua orientação no tom dela antes de enviar
          </p>
        </button>

        <button
          onClick={() => setModo('direto')}
          className={`flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all ${
            modo === 'direto'
              ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
              : 'border-outline-variant/20 hover:bg-surface-container'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}>
              send
            </span>
            <span className="text-[13px] font-semibold text-on-surface">Enviar diretamente</span>
          </div>
          <p className="text-[11px] text-on-surface-variant">
            Sua mensagem vai exatamente como escrita para o cliente
          </p>
        </button>
      </div>

      {/* Input file oculto */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*,text/plain,text/csv"
        onChange={handleFileChange}
      />

      {/* Preview do arquivo anexado */}
      {arquivo && (
        <div className="flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
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

      {/* Textarea */}
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          {modo === 'ia' ? `Sua orientação para ${nomeIa}` : 'Mensagem para o cliente'}
        </label>
        <div className="relative">
          <textarea
            rows={4}
            value={conteudo}
            onChange={e => setConteudo(e.target.value)}
            placeholder={
              modo === 'ia'
                ? 'Ex: Explique que o prazo do DAS é dia 20 e que ele pode pagar pelo app...'
                : arquivo
                ? 'Legenda (opcional)...'
                : 'Escreva a mensagem exata que o cliente vai receber...'
            }
            className="w-full resize-none rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {podeAnexar && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface disabled:opacity-40 transition-all"
              title="Anexar arquivo"
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-on-surface-variant" />
              ) : (
                <span className="material-symbols-outlined text-[20px]">attach_file</span>
              )}
            </button>
          )}
        </div>
      </div>

      {erro && (
        <p className="text-[12px] text-error">{erro}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleEnviar}
          disabled={loading || uploading || (!conteudo.trim() && !arquivo)}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-primary/90 disabled:opacity-40"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {modo === 'ia' ? `${nomeIa} está reformulando...` : 'Enviando...'}
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: "'FILL' 1" }}>
                {modo === 'ia' ? 'smart_toy' : 'send'}
              </span>
              {modo === 'ia' ? `Enviar via ${nomeIa}` : 'Enviar diretamente'}
            </>
          )}
        </button>
        <p className="text-[11px] text-on-surface-variant/50">
          {modo === 'ia'
            ? `${nomeIa} reformulará e enviará automaticamente`
            : 'A mensagem será enviada como está'}
        </p>
      </div>
    </div>
  )
}
