'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'
import type { DocSistema } from '@/components/crm/documento-picker'

export type Mensagem = {
  id: string
  role: string
  conteudo: string | null
  criadaEm: string | Date
  status?: 'pending' | 'sent' | 'failed'
  erroEnvio?: string | null
  mediaUrl?: string | null
  mediaType?: string | null
  mediaFileName?: string | null
  mediaMimeType?: string | null
  hasWhatsappMedia?: boolean
  excluido?: boolean
}

export type ArquivoAnexo = {
  url: string
  type: 'image' | 'document'
  name: string
  mimeType: string
  previewUrl?: string
}

export type EntityInfo = {
  entidadeTipo: 'lead' | 'cliente' | 'socio'
  entidadeId: string
}

// Regex compartilhada entre hook e panel — evita duplicação (FIX #9)
export const WHATSAPP_API_PATH_PATTERN = /^\/api\/(leads|clientes|socios)\/([a-z0-9-]+)\/whatsapp$/

// Valida que apiPath é um dos paths conhecidos do sistema e extrai entidade/id
function parseEntityFromPath(apiPath: string): EntityInfo | null {
  const m = apiPath.match(WHATSAPP_API_PATH_PATTERN)
  if (!m) return null
  const mapa: Record<string, 'lead' | 'cliente' | 'socio'> = {
    leads: 'lead',
    clientes: 'cliente',
    socios: 'socio',
  }
  return { entidadeTipo: mapa[m[1]], entidadeId: m[2] }
}

export function useWhatsAppChat(apiPath: string) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [pausada, setPausada] = useState(false)
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [assumindo, setAssumindo] = useState(false)
  const [telefone, setTelefone] = useState<string | null>(null)
  const [semNumero, setSemNumero] = useState(false)
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [reativando, setReativando] = useState(false)
  // FIX #9: usar Set para suportar múltiplas exclusões sem race condition
  const [excluindo, setExcluindo] = useState<Set<string>>(new Set())
  const [arquivo, setArquivo] = useState<ArquivoAnexo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [naoModoIA, setNaoModoIA] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const isFirstLoadRef = useRef(true)
  // Mantém previewUrl acessível no cleanup sem depender de state
  const arquivoPreviewRef = useRef<string | null>(null)
  // Bug #6: rastreia saúde do SSE para evitar polling duplicado quando SSE está ativo
  const sseHealthyRef = useRef(false)

  const entity = parseEntityFromPath(apiPath)

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
    } catch (err) {
      // FIX #4: catch nunca mais silencioso
      console.error('[whatsapp-chat] carregar error:', err)
      Sentry.captureException(err, {
        tags: { module: 'whatsapp-chat', operation: 'carregar' },
        extra: { apiPath },
      })
    }
  }, [apiPath])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    arquivoPreviewRef.current = arquivo?.previewUrl ?? null
  }, [arquivo])

  // Revoga object URL ao desmontar — evita leak se componente fecha com arquivo pendente
  useEffect(() => {
    return () => {
      if (arquivoPreviewRef.current) URL.revokeObjectURL(arquivoPreviewRef.current)
    }
  }, [])

  // SSE com reconexão exponencial. FIX #2: isMounted é definido ANTES de conectar()
  // para evitar race condition entre cleanup e setTimeout de reconexão.
  useEffect(() => {
    if (!conversaId) return

    let es: EventSource | null = null
    let tentativas = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let isMounted = true  // FIX #2: flag definido antes de conectar()

    function conectar() {
      if (!isMounted) return  // FIX #2: não conectar se já desmontou
      es = new EventSource(`/api/stream/conversas/${conversaId}`)
      es.onmessage = (e) => {
        tentativas = 0
        sseHealthyRef.current = true  // Bug #6: SSE ativo — desabilita polling
        try {
          const data = JSON.parse(e.data)
          if (data?.type === 'mensagem_excluida' && data.mensagemId) {
            setMensagens(prev => prev.map(m =>
              m.id === data.mensagemId
                ? { ...m, excluido: true, conteudo: null, mediaUrl: null, mediaType: null, mediaFileName: null }
                : m
            ))
            return
          }
        } catch { }
        carregar()
      }
      es.onerror = () => {
        es?.close()
        if (!isMounted || tentativas >= 5) {
          sseHealthyRef.current = false  // Bug #6: SSE desistiu — ativa polling
          return
        }
        sseHealthyRef.current = false
        tentativas++
        timeoutId = setTimeout(conectar, Math.min(1000 * 2 ** tentativas, 30_000))
      }
    }

    conectar()
    return () => {
      isMounted = false  // FIX #2: isMounted = false ANTES de tudo
      sseHealthyRef.current = false
      if (timeoutId) clearTimeout(timeoutId)
      es?.close()
    }
  }, [conversaId, carregar])

  // Polling de 8s — fallback quando SSE falha (múltiplos workers em produção)
  // Bug #6: só dispara quando SSE não está saudável
  useEffect(() => {
    if (!conversaId) return
    const id = setInterval(() => {
      if (!document.hidden && !sseHealthyRef.current) carregar()
    }, 8_000)
    return () => clearInterval(id)
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // FIX #7: reset input em TODOS os caminhos de erro (antes estava só no finally)
    function resetInput() {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    if (!entity) {
      toast.error('Não foi possível identificar o destinatário')
      resetInput()
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('Arquivo muito grande. O limite é 25 MB.')
      resetInput()
      return
    }

    setUploading(true)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'outro',
          entidadeId: entity.entidadeId,
          entidadeTipo: entity.entidadeTipo,
          contentType: file.type,
        }),
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
    } catch (err) {
      toast.error('Erro ao fazer upload do arquivo')
      Sentry.captureException(err, {
        tags: { module: 'whatsapp-chat', operation: 'upload' },
        extra: { apiPath, fileName: file.name, fileSize: file.size },
      })
    } finally {
      setUploading(false)
      resetInput()
    }
  }

  function removerArquivo() {
    if (arquivo?.previewUrl) URL.revokeObjectURL(arquivo.previewUrl)
    setArquivo(null)
  }

  function handleDocSistema(doc: DocSistema) {
    setArquivo({
      url: doc.url,
      type: 'document',
      name: doc.nome,
      mimeType: doc.mimeType ?? 'application/octet-stream',
    })
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
            mediaUrl: arquivo.url,
            mediaType: arquivo.type,
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
        // FIX #18: log quando clone/json falha
        try {
          const data = await res.clone().json()
          if (data?.conversaId) setConversaId(data.conversaId)
        } catch (cloneErr) {
          console.error('[whatsapp-chat] erro ao extrair conversaId:', cloneErr)
        }
      }
      await carregar()
    } catch (err) {
      toast.error('Erro ao enviar mensagem')
      Sentry.captureException(err, {
        tags: { module: 'whatsapp-chat', operation: 'enviar' },
        extra: { apiPath, conversaId },
      })
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
    } catch (err) {
      toast.error('Erro ao assumir controle')
      Sentry.captureException(err, {
        tags: { module: 'whatsapp-chat', operation: 'assumir' },
        extra: { conversaId },
      })
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
      setNaoModoIA(false)  // FIX #5: reset naoModoIA ao devolver para IA
      toast.success('IA reativada para esta conversa')
    } catch (err) {
      toast.error('Erro ao reativar IA')
      Sentry.captureException(err, {
        tags: { module: 'whatsapp-chat', operation: 'reativar' },
        extra: { conversaId },
      })
    } finally {
      setReativando(false)
    }
  }

  async function excluirMensagem(mensagemId: string) {
    // FIX #9: Set imutável para prevenir race condition de clique duplo
    if (!conversaId || excluindo.has(mensagemId)) return
    if (!confirm('Apagar esta mensagem para todos?')) return
    setExcluindo(prev => new Set(prev).add(mensagemId))
    try {
      const res = await fetch(`/api/conversas/${conversaId}/mensagens/${mensagemId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir mensagem'); return }
      setMensagens(prev => prev.map(m =>
        m.id === mensagemId
          ? { ...m, excluido: true, conteudo: null, mediaUrl: null, mediaType: null, mediaFileName: null }
          : m
      ))
    } catch (err) {
      toast.error('Erro ao excluir mensagem')
      Sentry.captureException(err, {
        tags: { module: 'whatsapp-chat', operation: 'excluir' },
        extra: { conversaId, mensagemId },
      })
    } finally {
      setExcluindo(prev => {
        const next = new Set(prev)
        next.delete(mensagemId)
        return next
      })
    }
  }

  return {
    // state
    mensagens, pausada, conversaId, telefone, semNumero,
    texto, setTexto,
    sending, reativando, assumindo, excluindo,
    arquivo, uploading,
    naoModoIA, setNaoModoIA,
    pickerOpen, setPickerOpen,
    entity,
    // refs
    fileInputRef, bottomRef, scrollContainerRef,
    // handlers
    onScroll, handleFileChange, removerArquivo, handleDocSistema,
    enviar, assumirControle, reativarIA, excluirMensagem,
  }
}
