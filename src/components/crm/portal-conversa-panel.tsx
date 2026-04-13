'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'
import { DocumentoPicker, type DocSistema } from '@/components/crm/documento-picker'

type ArquivoAnexo = {
  url: string
  type: 'image' | 'document'
  name: string
  mimeType: string
  previewUrl?: string
}

type Mensagem = {
  id: string
  role: string
  conteudo: string | null
  criadaEm: string | Date
  excluido?: boolean
  mediaUrl?: string | null
  mediaType?: string | null
  mediaFileName?: string | null
  hasWhatsappMedia?: boolean
}

export function PortalConversaPanel({
  conversaId,
  nomeExibido,
  clienteId,
  onClose,
}: {
  conversaId: string
  nomeExibido: string
  clienteId?: string
  onClose: () => void
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [pausada, setPausada] = useState(false)
  const [assumindo, setAssumindo] = useState(false)
  const [reativando, setReativando] = useState(false)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [arquivo, setArquivo] = useState<ArquivoAnexo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isFirstLoadRef = useRef(true)
  const msgCountRef = useRef(0)
  // Race condition: versão incremental para descartar respostas stale de carregar() concorrentes.
  const carregarVersionRef = useRef(0)
  // SSE health: evita polling duplicado quando SSE está ativo.
  const sseHealthyRef = useRef(false)

  const carregar = useCallback(async () => {
    const version = ++carregarVersionRef.current
    try {
      const res = await fetch(`/api/conversas/${conversaId}`, { cache: 'no-store' })
      if (version !== carregarVersionRef.current) return
      if (!res.ok) return
      const data = await res.json()
      if (version !== carregarVersionRef.current) return
      setMensagens(data.mensagens ?? [])
      setPausada(data.pausada ?? false)
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao carregar mensagens:', { conversaId, err })
    }
  }, [conversaId])

  useEffect(() => { void carregar() }, [carregar])

  // SSE — atualizações em tempo real quando cliente envia mensagem
  useEffect(() => {
    let es: EventSource | null = null
    let tentativas = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let encerrado = false

    function conectar() {
      es = new EventSource(`/api/stream/conversas/${conversaId}`)
      es.onmessage = (e) => {
        tentativas = 0
        sseHealthyRef.current = true
        try {
          const data = JSON.parse(e.data)
          if (data?.type === 'mensagem_excluida' && data.mensagemId) {
            setMensagens(prev => prev.map(m =>
              m.id === data.mensagemId ? { ...m, excluido: true, conteudo: null } : m
            ))
            return
          }
        } catch (err) { console.error('[crm/portal-conversa] falha ao processar evento SSE:', err) }
        void carregar()
      }
      es.onerror = () => {
        es?.close()
        sseHealthyRef.current = false
        if (encerrado || tentativas >= 5) return
        tentativas++
        timeoutId = setTimeout(conectar, Math.min(1000 * 2 ** tentativas, 30_000))
      }
    }

    conectar()
    return () => {
      encerrado = true
      sseHealthyRef.current = false
      if (timeoutId) clearTimeout(timeoutId)
      es?.close()
    }
  }, [conversaId, carregar])

  // Polling de 8s — fallback quando SSE falha (múltiplos workers não compartilham eventBus)
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden && !sseHealthyRef.current) void carregar()
    }, 8_000)
    return () => clearInterval(id)
  }, [carregar])

  // Scroll automático ao fundo — só quando o número de mensagens cresce
  useEffect(() => {
    const total = mensagens.length
    if (total === 0) return
    if (isFirstLoadRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      isFirstLoadRef.current = false
      msgCountRef.current = total
      return
    }
    if (total > msgCountRef.current) {
      msgCountRef.current = total
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mensagens])

  async function assumir() {
    setAssumindo(true)
    try {
      const res = await fetch('/api/conversas/pausar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaId }),
      })
      if (!res.ok) { toast.error('Erro ao assumir controle'); return }
      setPausada(true)
      toast.success('Você assumiu o controle da conversa')
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao assumir controle:', { conversaId, err })
      Sentry.captureException(err, { tags: { module: 'portal-conversa', operation: 'assumir' }, extra: { conversaId } })
      toast.error('Erro ao assumir controle')
    } finally {
      setAssumindo(false)
    }
  }

  async function reativarIA() {
    setReativando(true)
    try {
      const res = await fetch(`/api/conversas/${conversaId}/retomar`, { method: 'POST' })
      if (!res.ok) { toast.error('Erro ao devolver à IA'); return }
      setPausada(false)
      toast.success('IA reativada')
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao reativar IA:', { conversaId, err })
      Sentry.captureException(err, { tags: { module: 'portal-conversa', operation: 'reativar-ia' }, extra: { conversaId } })
      toast.error('Erro ao devolver à IA')
    } finally {
      setReativando(false)
    }
  }

  async function excluirMensagem(conversaId: string, mensagemId: string) {
    if (excluindo) return
    if (!confirm('Apagar esta mensagem para todos?')) return
    setExcluindo(mensagemId)
    try {
      const res = await fetch(`/api/conversas/${conversaId}/mensagens/${mensagemId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir mensagem'); return }
      setMensagens(prev => prev.map(m =>
        m.id === mensagemId ? { ...m, excluido: true, conteudo: null } : m
      ))
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao excluir mensagem:', { mensagemId, err })
      Sentry.captureException(err, { tags: { module: 'portal-conversa', operation: 'excluir-mensagem' }, extra: { conversaId, mensagemId } })
      toast.error('Erro ao excluir mensagem')
    } finally {
      setExcluindo(null)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!clienteId) { toast.error('Cliente não identificado para fazer upload.'); return }
    if (file.size > 25 * 1024 * 1024) { toast.error('Arquivo muito grande. O limite é 25 MB.'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('tipo', 'outro')
      formData.append('entidadeId', clienteId)
      formData.append('entidadeTipo', 'cliente')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) { toast.error('Tipo de arquivo não permitido'); return }
      const { publicUrl } = await res.json() as { publicUrl: string }
      const isImage = file.type.startsWith('image/')
      setArquivo({
        url: publicUrl,
        type: isImage ? 'image' : 'document',
        name: file.name,
        mimeType: file.type,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      })
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao fazer upload:', { clienteId, err })
      Sentry.captureException(err, { tags: { module: 'portal-conversa', operation: 'upload' }, extra: { clienteId } })
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
    if ((!texto.trim() && !arquivo) || sending) return
    const textoEnviar = texto.trim()
    setTexto('')
    setSending(true)
    try {
      const res = await fetch(`/api/conversas/${conversaId}/mensagem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: textoEnviar || undefined,
          ...(arquivo && {
            mediaUrl:      arquivo.url,
            mediaType:     arquivo.type,
            mediaFileName: arquivo.name,
            mediaMimeType: arquivo.mimeType,
          }),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erro ao enviar mensagem')
        setTexto(textoEnviar)
        return
      }
      removerArquivo()
    } catch (err: unknown) {
      console.error('[PortalConversaPanel] erro ao enviar mensagem:', { conversaId, err })
      Sentry.captureException(err, { tags: { module: 'portal-conversa', operation: 'enviar' }, extra: { conversaId } })
      toast.error('Erro ao enviar mensagem')
      setTexto(textoEnviar)
    } finally {
      setSending(false)
      // FIX: sempre recarregar após envio — mesmo se fetch lançou exceção
      // (mensagem pode já estar salva no banco quando a conexão TCP sofre timeout)
      await carregar()
    }
  }

  function formatTime(d: string | Date): string {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  const initials = nomeExibido
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DocumentoPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleDocSistema}
        clienteId={clienteId}
      />
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 lg:gap-3 border-b border-outline-variant/15 bg-card px-3 lg:px-4 py-3">
        <button
          onClick={onClose}
          className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[12px] font-bold text-violet-600">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-on-surface">{nomeExibido}</p>
          <p className="text-[11px] text-violet-500">Portal do cliente</p>
        </div>
        <button
          onClick={onClose}
          className="hidden lg:flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {mensagens.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-on-surface-variant/50">Sem mensagens</p>
        ) : (
          mensagens.map(m => (
            <div key={m.id} className={`group flex gap-3 ${m.role === 'assistant' ? 'flex-row-reverse' : ''}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${m.excluido
                  ? 'rounded-tr-sm bg-surface-container/60 text-on-surface-variant/50 ring-1 ring-outline-variant/20'
                  : m.role === 'assistant'
                    ? 'rounded-tr-sm bg-violet-500/10 text-on-surface'
                    : 'rounded-tl-sm bg-surface-container text-on-surface'
                }`}>
                {m.excluido ? (
                  <p className="flex items-center gap-1.5 italic text-[12px]">
                    <span className="material-symbols-outlined text-[13px]">block</span>
                    Mensagem excluída
                  </p>
                ) : m.mediaUrl && m.mediaType === 'image' ? (
                  <div className="flex flex-col gap-1.5">
                    <img src={m.mediaUrl} alt={m.mediaFileName ?? 'imagem'} className="max-w-full rounded-xl object-cover" />
                    {m.conteudo && <p className="whitespace-pre-wrap text-[13px]">{m.conteudo}</p>}
                  </div>
                ) : m.mediaUrl ? (
                  <div className="flex flex-col gap-1.5">
                    <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 hover:bg-surface-container transition-colors">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">attach_file</span>
                      <span className="text-[12px] truncate max-w-[9rem] sm:max-w-[200px]">{m.mediaFileName ?? 'Arquivo'}</span>
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/60 shrink-0">download</span>
                    </a>
                    {m.conteudo && <p className="whitespace-pre-wrap text-[13px]">{m.conteudo}</p>}
                  </div>
                ) : m.hasWhatsappMedia ? (
                  <a href={`/api/whatsapp/media/${m.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 hover:bg-surface-container transition-colors">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">attach_file</span>
                    <span className="text-[12px] truncate max-w-[9rem] sm:max-w-[200px]">Arquivo do cliente</span>
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant/60 shrink-0">download</span>
                  </a>
                ) : (
                  <p className="whitespace-pre-wrap">{m.conteudo}</p>
                )}
                {!m.excluido && (
                  <p className={`mt-1 text-[10px] ${m.role === 'assistant' ? 'text-right text-violet-400/80' : 'text-on-surface-variant/40'
                    }`}>
                    {formatTime(m.criadaEm)}
                  </p>
                )}
              </div>
              {m.role === 'assistant' && !m.excluido && (
                <button
                  onClick={() => excluirMensagem(conversaId, m.id)}
                  disabled={excluindo === m.id}
                  className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full text-on-surface-variant/0 transition-all hover:bg-error/10 hover:text-error group-hover:text-on-surface-variant/40 disabled:opacity-50"
                  title="Apagar para todos"
                >
                  {excluindo === m.id ? (
                    <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  )}
                </button>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      {pausada ? (
        <div className="shrink-0 space-y-2 border-t border-outline-variant/15 bg-card p-3">
          {/* Preview de arquivo */}
          {arquivo && (
            <div className="flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
              {arquivo.type === 'image' && arquivo.previewUrl ? (
                <img src={arquivo.previewUrl} alt="preview" className="h-9 w-9 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">attach_file</span>
              )}
              <span className="flex-1 truncate text-[12px] text-on-surface">{arquivo.name}</span>
              <button onClick={removerArquivo} className="shrink-0 text-on-surface-variant/50 hover:text-error transition-colors">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*,text/plain,text/csv"
            onChange={handleFileChange}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
              title="Anexar arquivo do computador"
            >
              {uploading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-on-surface-variant" />
                : <span className="material-symbols-outlined text-[18px]">attach_file</span>
              }
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={uploading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
              title="Documentos do cliente"
            >
              <span className="material-symbols-outlined text-[18px]">folder_open</span>
            </button>
            <input
              className="flex-1 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              placeholder={arquivo ? 'Legenda (opcional)...' : 'Digite uma resposta...'}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }}
              disabled={sending}
            />
            <button
              onClick={enviar}
              disabled={(!texto.trim() && !arquivo) || sending || uploading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white transition-colors hover:bg-violet-600 disabled:opacity-40"
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                send
              </span>
            </button>
          </div>
          <button
            onClick={reativarIA}
            disabled={reativando}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-outline-variant/25 py-2 text-[12px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">smart_toy</span>
            {reativando ? 'Devolvendo...' : 'Devolver à IA'}
          </button>
        </div>
      ) : (
        <div className="shrink-0 border-t border-outline-variant/15 bg-card p-3">
          <button
            onClick={assumir}
            disabled={assumindo}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">headset_mic</span>
            {assumindo ? 'Assumindo...' : 'Assumir controle desta conversa'}
          </button>
        </div>
      )}
    </div>
  )
}
