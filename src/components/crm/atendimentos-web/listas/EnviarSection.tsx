'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'

export function EnviarSection({
  listaId,
  totalMembros,
  onEnviou,
}: {
  listaId: string
  totalMembros: number
  onEnviou: () => void
}) {
  const [conteudo, setConteudo]     = useState('')
  const [arquivo, setArquivo]       = useState<{ url: string; name: string; type: string; mimeType: string } | null>(null)
  const [enviando, setEnviando]     = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [erro, setErro]             = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { setErro('Arquivo muito grande. O limite é 25 MB.'); return }

    setUploading(true)
    setErro(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('tipo', 'outro')
      formData.append('entidadeId', listaId)
      formData.append('entidadeTipo', 'broadcast')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) { setErro('Tipo de arquivo não suportado. Use PDF, imagem ou documento Office.'); return }
      const { publicUrl } = await res.json() as { publicUrl: string }
      const isImage = file.type.startsWith('image/')
      setArquivo({ url: publicUrl, name: file.name, type: isImage ? 'image' : 'document', mimeType: file.type })
    } catch (err) {
      setErro('Não foi possível fazer o upload. Verifique sua conexão e tente novamente.')
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'upload' } })
    } finally {
      setUploading(false)
    }
  }

  async function enviar() {
    if (!conteudo.trim() && !arquivo) return
    if (totalMembros === 0) { setErro('A lista não tem membros. Adicione contatos antes de enviar.'); return }

    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/crm/listas-transmissao/${listaId}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conteudo: conteudo.trim(),
          mediaUrl: arquivo?.url ?? null,
          mediaType: arquivo?.type ?? null,
          mediaFileName: arquivo?.name ?? null,
          mediaMimeType: arquivo?.mimeType ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error ?? 'Não foi possível enviar a mensagem. Tente novamente.'); return }
      setConteudo('')
      setArquivo(null)
      onEnviou()
    } catch (err) {
      setErro('Não foi possível enviar o broadcast. Verifique sua conexão e tente novamente.')
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'enviar-broadcast' } })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* Aviso */}
      <div className="flex items-start gap-2 rounded-lg bg-orange-status/5 border border-orange-status/15 px-3 py-2.5">
        <span className="material-symbols-outlined mt-0.5 text-[14px] text-orange-status shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
        <p className="text-[11px] leading-relaxed text-orange-status/80">
          A mensagem será enviada individualmente para cada membro. O envio pode levar alguns minutos dependendo da quantidade de destinatários.
        </p>
      </div>

      {/* Textarea */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold text-on-surface-variant/60">Mensagem</label>
        <textarea
          value={conteudo}
          onChange={e => setConteudo(e.target.value)}
          placeholder="Digite a mensagem do broadcast..."
          rows={4}
          className="w-full resize-none rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {/* Arquivo */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold text-on-surface-variant/60">Arquivo (opcional)</label>
        {arquivo ? (
          <div className="flex items-center gap-2 rounded-lg border border-outline-variant/15 bg-card px-3 py-2">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>
              {arquivo.type === 'image' ? 'image' : 'description'}
            </span>
            <p className="flex-1 truncate text-[12px] text-on-surface">{arquivo.name}</p>
            <button onClick={() => setArquivo(null)} className="text-error/50 hover:text-error transition-colors">
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-outline-variant/25 px-3 py-2.5 text-[12px] text-on-surface-variant/50 transition-colors hover:border-primary/30 hover:text-primary">
            <span className="material-symbols-outlined text-[16px]">attach_file</span>
            {uploading ? 'Enviando...' : 'Anexar arquivo (PDF, imagem, documento)'}
            <input type="file" className="hidden" onChange={e => void handleFileChange(e)} disabled={uploading}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
          </label>
        )}
      </div>

      {/* Erro */}
      {erro && (
        <p className="text-[11px] text-error">{erro}</p>
      )}

      {/* Botão enviar */}
      <button
        onClick={() => void enviar()}
        disabled={enviando || (!conteudo.trim() && !arquivo) || totalMembros === 0}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#1fb855] active:scale-[0.98] disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
        {enviando ? 'Enviando...' : `Enviar para ${totalMembros} membro${totalMembros !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}
