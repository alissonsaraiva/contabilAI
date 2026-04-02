'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { formatDateTime } from '@/lib/utils'
import { toast } from 'sonner'
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
  conteudo: string
  criadaEm: string | Date
  mediaUrl?: string | null
  mediaType?: string | null
  mediaFileName?: string | null
}

type Conversa = {
  id: string
  criadaEm: string | Date
  atualizadaEm: string | Date
  pausadaEm: string | Date | null
  mensagens: Mensagem[]
}

type Props = {
  clienteId: string
  clienteNome: string
  nomeIa?: string
  open: boolean
  onClose: () => void
}

export function PortalChatDrawer({ clienteId, clienteNome, nomeIa = 'Assistente', open, onClose }: Props) {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [loading, setLoading] = useState(false)
  const [conversaAberta, setConversaAberta] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [arquivo, setArquivo] = useState<ArquivoAnexo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/crm/clientes/${clienteId}/portal-chat`)
      .then(r => r.json())
      .then((data: { conversas: Conversa[] }) => {
        setConversas(data.conversas ?? [])
        if (data.conversas?.length === 1) setConversaAberta(data.conversas[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, clienteId])

  useEffect(() => { load() }, [load])

  // SSE — recebe mensagens novas do cliente enquanto o operador está com a conversa aberta
  // /api/stream/conversas/[id] escuta portal-user:{id} (cliente envia msg em conv pausada)
  // e whatsapp:{id} (por completude). Chama load() para re-buscar as mensagens atualizadas.
  // Reconecta automaticamente até 5x com backoff exponencial após erro.
  useEffect(() => {
    if (!conversaAberta || !open) return
    let es: EventSource
    let tentativas = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let encerrado = false

    function conectar() {
      es = new EventSource(`/api/stream/conversas/${conversaAberta}`)
      es.onmessage = () => { tentativas = 0; load() }
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
  }, [conversaAberta, open, load])

  // Polling de 8s — fallback para múltiplos workers em produção (eventBus não cruza processos)
  useEffect(() => {
    if (!conversaAberta || !open) return
    const id = setInterval(() => {
      if (!document.hidden) load()
    }, 8_000)
    return () => clearInterval(id)
  }, [conversaAberta, open, load])

  // Scroll para o final quando mensagens carregam
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversaAberta, conversas])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { toast.error('Arquivo muito grande. O limite é 25 MB.'); return }
    setUploading(true)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'outro', entidadeId: clienteId, entidadeTipo: 'cliente', contentType: file.type }),
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

  async function handleEnviar() {
    if ((!texto.trim() && !arquivo) || !conversaAberta || enviando) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/portal-chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          conversaId: conversaAberta,
          mensagem:   texto.trim() || undefined,
          ...(arquivo && {
            mediaUrl:      arquivo.url,
            mediaType:     arquivo.type,
            mediaFileName: arquivo.name,
            mediaMimeType: arquivo.mimeType,
          }),
        }),
      })
      if (!res.ok) throw new Error()
      setTexto('')
      removerArquivo()
      load()
    } catch {
      toast.error('Erro ao enviar mensagem')
    } finally {
      setEnviando(false)
    }
  }

  const conversaAtual = conversas.find(c => c.id === conversaAberta)

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side="right" className="flex w-[420px] flex-col p-0 sm:max-w-[420px]" showCloseButton={false}>
        <DocumentoPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={handleDocSistema}
          clienteId={clienteId}
        />

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tertiary/10">
            <span className="material-symbols-outlined text-[18px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
              web
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-on-surface truncate">{clienteNome}</p>
            <p className="text-[11px] text-on-surface-variant">Chat do Portal ({nomeIa})</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Lista de sessões / Conversa aberta */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center py-12 text-[13px] text-on-surface-variant/60">
              <span className="material-symbols-outlined animate-spin mr-2 text-[18px]">progress_activity</span>
              Carregando...
            </div>
          )}

          {!loading && conversas.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25">forum</span>
              <p className="text-[13px] font-semibold text-on-surface-variant">Nenhuma conversa no portal</p>
              <p className="mt-1 text-[12px] text-on-surface-variant/60">O cliente ainda não conversou com {nomeIa}.</p>
            </div>
          )}

          {!loading && conversas.length > 0 && !conversaAberta && (
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50 px-1 mb-3">
                {conversas.length} sessão{conversas.length > 1 ? 'ões' : ''} registrada{conversas.length > 1 ? 's' : ''}
              </p>
              {conversas.map(c => (
                <button
                  key={c.id}
                  onClick={() => setConversaAberta(c.id)}
                  className="w-full flex items-center gap-3 rounded-xl border border-outline-variant/15 bg-card px-4 py-3 text-left transition-colors hover:bg-surface-container-low/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-on-surface">
                      {formatDateTime(c.criadaEm)}
                    </p>
                    <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                      {c.mensagens.length} mensagens · atualizado {formatDateTime(c.atualizadaEm)}
                    </p>
                    {c.mensagens.length > 0 && (
                      <p className="text-[11px] text-on-surface-variant/50 mt-1 truncate">
                        {c.mensagens[c.mensagens.length - 1].conteudo}
                      </p>
                    )}
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">chevron_right</span>
                </button>
              ))}
            </div>
          )}

          {!loading && conversaAtual && (
            <>
              {/* Sub-header quando tem múltiplas sessões */}
              {conversas.length > 1 && (
                <div className="flex items-center gap-2 border-b border-outline-variant/10 px-4 py-2">
                  <button
                    onClick={() => setConversaAberta(null)}
                    className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
                  >
                    <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                    Sessões
                  </button>
                  <span className="text-[11px] text-on-surface-variant/50">·</span>
                  <span className="text-[11px] text-on-surface-variant/60">{formatDateTime(conversaAtual.criadaEm)}</span>
                </div>
              )}

              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto space-y-2.5 p-4 bg-surface-container-low/20">
                {conversaAtual.mensagens.length === 0 && (
                  <p className="text-center text-[12px] text-on-surface-variant/50 py-8">
                    Conversa sem mensagens registradas.
                  </p>
                )}
                {conversaAtual.mensagens.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tertiary/10">
                        <span className="material-symbols-outlined text-[12px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
                          smart_toy
                        </span>
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-tertiary text-white rounded-br-md'
                        : 'bg-white text-on-surface rounded-bl-md border border-outline-variant/10'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.conteudo}</p>
                      <p className={`mt-1 text-[10px] ${m.role === 'user' ? 'text-white/50' : 'text-on-surface-variant/40'}`}>
                        {new Date(m.criadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {m.role === 'user' && (
                      <div className="ml-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-container">
                        <span className="material-symbols-outlined text-[12px] text-on-surface-variant">person</span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Input de resposta */}
              <div className="border-t border-outline-variant/10 p-3 bg-card">
                {conversaAtual.pausadaEm && (
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-amber-600 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">pause_circle</span>
                    IA pausada · aguardando resposta humana
                  </p>
                )}
                {/* Preview de arquivo anexado */}
                {arquivo && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
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
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
                    title="Anexar arquivo do computador"
                  >
                    {uploading
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-on-surface-variant" />
                      : <span className="material-symbols-outlined text-[16px]">attach_file</span>
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    disabled={uploading}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-40"
                    title="Documentos do cliente"
                  >
                    <span className="material-symbols-outlined text-[16px]">folder_open</span>
                  </button>
                  <textarea
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() } }}
                    placeholder={arquivo ? 'Legenda (opcional)...' : 'Responder ao cliente...'}
                    rows={2}
                    className="flex-1 resize-none rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[12px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
                  />
                  <button
                    onClick={handleEnviar}
                    disabled={(!texto.trim() && !arquivo) || enviando || uploading}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
                  >
                    {enviando
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      : <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                    }
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
