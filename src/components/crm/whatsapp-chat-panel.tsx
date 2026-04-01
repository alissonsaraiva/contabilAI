'use client'

import { useState, useEffect, useRef, useCallback, Component, type ReactNode, type ErrorInfo } from 'react'
import { toast } from 'sonner'

type Mensagem = {
  id: string
  role: string
  conteudo: string
  criadaEm: string | Date
  status?: 'pending' | 'sent' | 'failed'
  erroEnvio?: string | null
  mediaUrl?: string | null
  mediaType?: string | null
  mediaFileName?: string | null
  mediaMimeType?: string | null
}

type ArquivoAnexo = {
  url: string
  type: 'image' | 'document'
  name: string
  mimeType: string
  previewUrl?: string
}

export type WhatsAppChatPanelProps = {
  apiPath: string
  nomeExibido: string
  onClose: () => void
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

class WhatsAppChatBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WhatsAppChatPanel] render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-error/60">error</span>
          <p className="text-[13px] font-medium text-on-surface">Erro ao carregar conversa</p>
          <p className="text-[11px] text-on-surface-variant/60">{this.state.error?.message}</p>
          <button
            onClick={this.props.onClose}
            className="rounded-lg bg-surface-container px-4 py-2 text-[12px] text-on-surface hover:bg-surface-container-high"
          >
            Fechar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function WhatsAppChatPanel({ apiPath, nomeExibido, onClose }: WhatsAppChatPanelProps) {
  const [mensagens, setMensagens]     = useState<Mensagem[]>([])
  const [pausada, setPausada]         = useState(false)
  const [conversaId, setConversaId]   = useState<string | null>(null)
  const [assumindo, setAssumindo]     = useState(false)
  const [telefone, setTelefone]       = useState<string | null>(null)
  const [semNumero, setSemNumero]     = useState(false)
  const [texto, setTexto]             = useState('')
  const [sending, setSending]         = useState(false)
  const [reativando, setReativando]   = useState(false)
  const [arquivo, setArquivo]         = useState<ArquivoAnexo | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [naoModoIA, setNaoModoIA]     = useState(false)
  const fileInputRef                  = useRef<HTMLInputElement>(null)
  const bottomRef                     = useRef<HTMLDivElement>(null)
  const scrollContainerRef            = useRef<HTMLDivElement>(null)
  const isNearBottomRef               = useRef(true)
  const isFirstLoadRef                = useRef(true)
  // Mantém a previewUrl atual acessível no cleanup sem depender de state
  const arquivoPreviewRef             = useRef<string | null>(null)

  function onScroll() {
    const el = scrollContainerRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(apiPath)
      if (!res.ok) return
      const data = await res.json()
      if (!data.telefone && !data.conversa) {
        setSemNumero(true)
        return
      }
      setSemNumero(false)
      setMensagens(data.mensagens ?? [])
      setPausada(data.pausada ?? false)
      setConversaId(data.conversa?.id ?? null)
      setTelefone(data.telefone ?? null)
    } catch {}
  }, [apiPath])

  // Carrega ao montar (apiPath é estável durante a vida do componente)
  useEffect(() => {
    carregar()
  }, [carregar])

  // Mantém ref sincronizada com o arquivo atual para o cleanup
  useEffect(() => {
    arquivoPreviewRef.current = arquivo?.previewUrl ?? null
  }, [arquivo])

  // Revoga o object URL ao desmontar — evita leak se o componente fecha com arquivo pendente
  useEffect(() => {
    return () => {
      if (arquivoPreviewRef.current) URL.revokeObjectURL(arquivoPreviewRef.current)
    }
  }, [])

  // SSE — recebe ping quando nova mensagem WhatsApp chega
  // Reconecta automaticamente até 5x com backoff exponencial após erro
  useEffect(() => {
    if (!conversaId) return
    let es: EventSource
    let tentativas = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let encerrado = false

    function conectar() {
      es = new EventSource(`/api/stream/conversas/${conversaId}`)
      es.onmessage = () => { tentativas = 0; carregar() }
      es.onerror   = () => {
        es.close()
        if (encerrado || tentativas >= 5) return
        tentativas++
        timeoutId = setTimeout(conectar, Math.min(1000 * 2 ** tentativas, 30_000))
      }
    }

    conectar()
    return () => {
      encerrado = true
      if (timeoutId) clearTimeout(timeoutId)
      es.close()
    }
  }, [conversaId, carregar])

  // Scroll automático ao fundo
  useEffect(() => {
    if (mensagens.length === 0) return
    if (isFirstLoadRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      isFirstLoadRef.current = false
      return
    }
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [mensagens])

  function parseEntityFromPath(): { entidadeTipo: 'lead' | 'cliente' | 'socio'; entidadeId: string } | null {
    const m = apiPath.match(/\/api\/(leads|clientes|socios)\/([^/]+)\/whatsapp/)
    if (!m) return null
    const mapa: Record<string, 'lead' | 'cliente' | 'socio'> = { leads: 'lead', clientes: 'cliente', socios: 'socio' }
    return { entidadeTipo: mapa[m[1]], entidadeId: m[2] }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const entity = parseEntityFromPath()
    if (!entity) { toast.error('Não foi possível identificar o destinatário'); return }
    if (file.size > 25 * 1024 * 1024) { toast.error('Arquivo muito grande. O limite é 25 MB.'); return }

    setUploading(true)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'outro', entidadeId: entity.entidadeId, entidadeTipo: entity.entidadeTipo, contentType: file.type }),
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

  async function enviar() {
    if ((!texto.trim() && !arquivo) || sending) return
    setSending(true)
    try {
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conteudo: texto.trim(),
          pausarIA: !naoModoIA,
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
        if (res.status === 502) {
          const detalhe = err.detail ? ` (${String(err.detail).slice(0, 120)})` : ''
          toast.error(`Mensagem salva, mas não entregue ao WhatsApp.${detalhe}`, { duration: 8000 })
        } else {
          toast.error(err.error ?? 'Erro ao enviar mensagem')
        }
        await carregar()
        return
      }
      setTexto('')
      removerArquivo()
      if (!conversaId) {
        const data = await res.clone().json().catch(() => null)
        if (data?.conversaId) setConversaId(data.conversaId)
      }
      await carregar()
    } catch {
      toast.error('Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  async function assumirControle() {
    if (!conversaId) return
    setAssumindo(true)
    try {
      await fetch('/api/conversas/pausar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaId }),
      })
      setPausada(true)
      toast.success('Você assumiu o controle desta conversa')
    } catch {
      toast.error('Erro ao assumir controle')
    } finally {
      setAssumindo(false)
    }
  }

  async function reativarIA() {
    if (!conversaId) return
    setReativando(true)
    try {
      await fetch(`/api/conversas/${conversaId}/retomar`, { method: 'POST' })
      setPausada(false)
      toast.success('IA reativada para esta conversa')
    } catch {
      toast.error('Erro ao reativar IA')
    } finally {
      setReativando(false)
    }
  }

  return (
    <WhatsAppChatBoundary onClose={onClose}>
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-outline-variant/15 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15">
            <span
              className="material-symbols-outlined text-[18px] text-[#25D366]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              chat_bubble
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-on-surface">{nomeExibido}</p>
            <p className="text-[11px] text-on-surface-variant">{telefone ?? 'WhatsApp'}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant/60 transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {pausada ? (
          <div className="flex items-center gap-2 pl-12">
            <span className="flex items-center gap-1 rounded-full bg-orange-status/10 px-2.5 py-1 text-[11px] font-semibold text-orange-status">
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                support_agent
              </span>
              Você no controle
            </span>
            <button
              onClick={reativarIA}
              disabled={reativando}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                smart_toy
              </span>
              {reativando ? 'Devolvendo...' : 'Devolver para IA'}
            </button>
          </div>
        ) : (conversaId || mensagens.length > 0) ? (
          <div className="flex items-center gap-2 pl-12">
            <span className="flex items-center gap-1 rounded-full bg-[#25D366]/10 px-2.5 py-1 text-[11px] font-semibold text-[#25D366]">
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                smart_toy
              </span>
              IA ativa
            </span>
            {conversaId && (
              <button
                onClick={assumirControle}
                disabled={assumindo}
                className="flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[13px]">support_agent</span>
                {assumindo ? 'Assumindo...' : 'Assumir'}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Banner de pausa */}
      {pausada && (
        <div className="shrink-0 border-b border-orange-status/10 bg-orange-status/5 px-5 py-2">
          <p className="text-[11px] text-orange-status">
            IA pausada — o contato não receberá respostas automáticas. Retoma automaticamente após 1h de inatividade.
          </p>
        </div>
      )}

      {/* Mensagens */}
      <div ref={scrollContainerRef} onScroll={onScroll} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
        {semNumero ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">phone_disabled</span>
            <p className="text-[13px] font-medium text-on-surface-variant">Sem número cadastrado</p>
            <p className="mt-1 text-[12px] text-on-surface-variant/60">
              Adicione o telefone/WhatsApp para enviar mensagens.
            </p>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">chat_bubble</span>
            <p className="text-[13px] font-medium text-on-surface-variant">Nenhuma mensagem ainda</p>
            <p className="mt-1 text-[12px] text-on-surface-variant/60">
              Envie a primeira mensagem para iniciar a conversa
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mensagens.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                {m.role === 'user' && (
                  <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15">
                    <span className="material-symbols-outlined text-[12px] text-[#25D366]">person</span>
                  </div>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-bl-md bg-surface-container text-on-surface'
                      : m.status === 'failed'
                        ? 'rounded-br-md bg-error/10 text-on-surface ring-1 ring-error/20'
                        : 'rounded-br-md bg-primary text-white'
                  }`}
                >
                  {m.conteudo === '[áudio]' ? (
                    <div className="flex flex-col gap-1">
                      <audio controls src={`/api/whatsapp/media/${m.id}`} className="h-8 w-44 rounded-md" />
                      <p className="text-[10px] text-on-surface-variant/50">Áudio não transcrito</p>
                    </div>
                  ) : m.mediaUrl && m.mediaType === 'image' ? (
                    <div className="flex flex-col gap-1.5">
                      <img src={m.mediaUrl} alt={m.mediaFileName ?? 'imagem'} className="max-w-[220px] rounded-xl object-cover" />
                      {m.conteudo && <p className="whitespace-pre-wrap text-[12px]">{m.conteudo}</p>}
                    </div>
                  ) : m.mediaUrl ? (
                    <div className="flex flex-col gap-1.5">
                      <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 hover:bg-white/20 transition-colors">
                        <span className="material-symbols-outlined text-[18px] shrink-0">attach_file</span>
                        <span className="text-[12px] truncate max-w-[160px]">{m.mediaFileName ?? 'Arquivo'}</span>
                        <span className="material-symbols-outlined text-[14px] shrink-0 opacity-60">download</span>
                      </a>
                      {m.conteudo && <p className="whitespace-pre-wrap text-[12px]">{m.conteudo}</p>}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.conteudo}</p>
                  )}
                  <p className={`mt-1 text-[10px] ${m.role === 'user' ? 'text-on-surface-variant/50' : m.status === 'failed' ? 'text-error/60' : 'text-white/50'}`}>
                    {new Date(m.criadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {m.role === 'assistant' && m.status === 'failed' && (
                    <p
                      className="mt-0.5 flex items-center gap-1 text-[10px] text-error/70"
                      title={m.erroEnvio ?? 'Falha no envio'}
                    >
                      <span className="material-symbols-outlined text-[10px]">error</span>
                      Não entregue
                    </p>
                  )}
                </div>
                {m.role === 'assistant' && (
                  <div className="ml-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span
                      className="material-symbols-outlined text-[12px] text-primary"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      smart_toy
                    </span>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      {!semNumero && (
        <div className="shrink-0 border-t border-outline-variant/15 px-4 py-3">
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
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*,text/plain,text/csv"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
              title="Anexar arquivo"
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-on-surface-variant" />
              ) : (
                <span className="material-symbols-outlined text-[18px]">attach_file</span>
              )}
            </button>

            <textarea
              rows={1}
              className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] text-on-surface transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40"
              placeholder={arquivo ? 'Legenda (opcional)...' : 'Digite uma mensagem...'}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
              }}
            />

            {!pausada && (
              <button
                type="button"
                onClick={() => setNaoModoIA(v => !v)}
                title={naoModoIA ? 'Modo comunicado: IA continua ativa' : 'Clique para enviar sem pausar a IA'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  naoModoIA
                    ? 'border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366]'
                    : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant/40 hover:text-on-surface-variant'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: naoModoIA ? "'FILL' 1" : "'FILL' 0" }}
                >
                  smart_toy
                </span>
              </button>
            )}

            <button
              onClick={enviar}
              disabled={(!texto.trim() && !arquivo) || sending || uploading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white transition-colors hover:bg-[#1fb855] disabled:opacity-40"
            >
              {sending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              )}
            </button>
          </div>

          <p className="mt-2 text-center text-[11px] text-on-surface-variant/50">
            {pausada
              ? 'Você está no controle · IA pausada'
              : naoModoIA
                ? 'Modo comunicado · IA continuará ativa após o envio'
                : 'Ao enviar, a IA será pausada automaticamente'}
          </p>
        </div>
      )}
    </WhatsAppChatBoundary>
  )
}
