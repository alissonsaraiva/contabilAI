'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'
import type { DocSistema } from '@/components/crm/documento-picker'
import { humanizarErroWhatsApp } from '@/lib/whatsapp/humanizar-erro'

export type Mensagem = {
  id: string
  role: string
  /** Nome do operador humano que enviou — null quando é mensagem da IA */
  operadorNome?: string | null
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

export type AtribuidoPara = { id: string; nome: string } | null

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

// Infere MIME type pela extensão do nome do arquivo quando o campo está vazio no banco
export function inferMimeFromDoc(nome: string, mimeType: string | null): string {
  if (mimeType) return mimeType
  const ext = nome.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    pdf:  'application/pdf',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    gif:  'image/gif',
    webp: 'image/webp',
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:  'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv:  'text/csv',
    txt:  'text/plain',
  }
  return map[ext] ?? 'application/octet-stream'
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
  return { entidadeTipo: mapa[m[1]!]!, entidadeId: m[2]! }
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
  const [arquivos, setArquivos] = useState<ArquivoAnexo[]>([])
  const [uploading, setUploading] = useState(false)
  const [naoModoIA, setNaoModoIA] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [atribuidaPara, setAtribuidaPara] = useState<AtribuidoPara>(null)
  const [atribuindo, setAtribuindo] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const isFirstLoadRef = useRef(true)
  const msgCountRef = useRef(0)
  // Mantém previewUrls acessíveis no cleanup sem depender de state
  const arquivosPreviewRef = useRef<string[]>([])
  // Bug #6: rastreia saúde do SSE para evitar polling duplicado quando SSE está ativo
  const sseHealthyRef = useRef(false)
  // Race condition: versão incremental para descartar respostas stale de carregar() concorrentes.
  // Se SSE dispara void carregar() enquanto o POST ainda está em andamento e a resposta HTTP
  // chega depois do finally's await carregar(), ela sobrescreveria o estado correto.
  const carregarVersionRef = useRef(0)

  const entity = parseEntityFromPath(apiPath)

  function onScroll() {
    const el = scrollContainerRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }

  const carregar = useCallback(async () => {
    const version = ++carregarVersionRef.current
    try {
      // cache: 'no-store' impede browser de servir resposta cacheada em vez de ir ao servidor
      const res = await fetch(apiPath, { cache: 'no-store' })
      // Descarta resposta stale: outra chamada mais recente já foi disparada
      if (version !== carregarVersionRef.current) return
      if (!res.ok) return
      const data = await res.json()
      if (version !== carregarVersionRef.current) return
      if (!data.telefone && !data.conversa) {
        setSemNumero(true)
        return
      }
      setSemNumero(false)
      setMensagens(data.mensagens ?? [])
      setPausada(data.pausada ?? false)
      setConversaId(data.conversa?.id ?? null)
      setTelefone(data.telefone ?? null)
      setAtribuidaPara((data.conversa?.atribuidaPara as AtribuidoPara) ?? null)
    } catch (err) {
      // FIX #4: catch nunca mais silencioso
      console.error('[whatsapp-chat] carregar error:', err)
      // Erro de rede (usuário offline / VPS reiniciando) não é bug — não polui Sentry
      const isNetworkError = err instanceof TypeError && err.message === 'Failed to fetch'
      if (!isNetworkError) {
        Sentry.captureException(err, {
          tags: { module: 'whatsapp-chat', operation: 'carregar' },
          extra: { apiPath },
        })
      }
    }
  }, [apiPath])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    arquivosPreviewRef.current = arquivos.filter(a => a.previewUrl).map(a => a.previewUrl!)
  }, [arquivos])

  // Revoga object URLs ao desmontar — evita leak se componente fecha com arquivos pendentes
  useEffect(() => {
    return () => {
      arquivosPreviewRef.current.forEach(url => URL.revokeObjectURL(url))
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
        } catch (err) { console.error('[whatsapp-chat] falha ao processar evento SSE:', err) }
        void carregar()
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
      if (!document.hidden && !sseHealthyRef.current) void carregar()
    }, 8_000)
    return () => clearInterval(id)
  }, [conversaId, carregar])

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
      if (isNearBottomRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [mensagens])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    // FIX #7: reset input em TODOS os caminhos de erro (antes estava só no finally)
    function resetInput() {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }

    if (!entity) {
      toast.error('Destinatário não identificado. Recarregue a conversa.')
      resetInput()
      return
    }

    setUploading(true)
    try {
      const novos: ArquivoAnexo[] = []
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`"${file.name}" excede o limite de 25 MB.`)
          continue
        }
        const formData = new FormData()
        formData.append('file', file)
        formData.append('tipo', 'outro')
        formData.append('entidadeId', entity.entidadeId)
        formData.append('entidadeTipo', entity.entidadeTipo)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        if (!res.ok) { toast.error(`"${file.name}": tipo de arquivo não permitido.`); continue }
        const { publicUrl } = await res.json() as { publicUrl: string }
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
      toast.error('Falha ao anexar arquivo. Verifique sua conexão e tente novamente.')
      Sentry.captureException(err, {
        tags: { module: 'whatsapp-chat', operation: 'upload' },
        extra: { apiPath },
      })
    } finally {
      setUploading(false)
      resetInput()
    }
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

  function handleDocsSistema(docs: DocSistema[]) {
    const novos = docs.map(doc => ({
      url:      doc.url,
      type:     (doc.mimeType?.startsWith('image/') ? 'image' : 'document') as 'image' | 'document',
      name:     doc.nome,
      mimeType: inferMimeFromDoc(doc.nome, doc.mimeType),
    }))
    setArquivos(prev => [...prev, ...novos])
  }

  async function enviarPost(body: Record<string, unknown>): Promise<Response> {
    return fetch(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async function tratarErroEnvio(res: Response, tipo: 'arquivo' | 'mensagem') {
    const err = await res.json().catch(() => ({} as Record<string, unknown>))
    if (res.status === 502) {
      const acao = tipo === 'arquivo' ? 'Arquivo salvo' : 'Mensagem salva'
      const motivo = humanizarErroWhatsApp(String(err.detail ?? ''))
      toast.error(`${acao}, mas não entregue. ${motivo}`, { duration: 8000 })
    } else {
      toast.error((err.error as string | undefined) ?? `Erro ao enviar ${tipo}`)
    }
  }

  async function enviar() {
    if ((!texto.trim() && arquivos.length === 0) || sending) return
    setSending(true)
    try {
      let lastRes: Response | null = null

      if (arquivos.length > 0) {
        for (const arq of arquivos) {
          const res = await enviarPost({
            conteudo: '',
            pausarIA: !naoModoIA,
            mediaUrl:      arq.url,
            mediaType:     arq.type,
            mediaFileName: arq.name,
            mediaMimeType: arq.mimeType,
          })
          if (!res.ok) await tratarErroEnvio(res, 'arquivo')
          lastRes = res
        }
        if (texto.trim()) {
          lastRes = await enviarPost({ conteudo: texto.trim(), pausarIA: !naoModoIA })
          if (!lastRes.ok) await tratarErroEnvio(lastRes, 'mensagem')
        }
      } else {
        lastRes = await enviarPost({ conteudo: texto.trim(), pausarIA: !naoModoIA })
        if (!lastRes.ok) {
          await tratarErroEnvio(lastRes, 'mensagem')
          return
        }
      }

      setTexto('')
      removerTodos()
      if (!conversaId && lastRes) {
        // FIX #18: log quando clone/json falha
        try {
          const data = await lastRes.clone().json()
          if (data?.conversaId) setConversaId(data.conversaId)
        } catch (cloneErr) {
          console.error('[whatsapp-chat] erro ao extrair conversaId:', cloneErr)
        }
      }
    } catch (err) {
      toast.error('Falha de conexão ao enviar. Verifique sua internet e tente novamente.')
      Sentry.captureException(err, {
        tags: { module: 'whatsapp-chat', operation: 'enviar' },
        extra: { apiPath, conversaId },
      })
    } finally {
      setSending(false)
      // FIX: sempre recarregar após envio — mesmo se fetch lançou exceção
      // (ex: Nginx fecha conexão por timeout enquanto Evolution API processa)
      // A mensagem JÁ pode estar no banco; sem este carregar() ela não aparece no painel.
      await carregar()
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
      toast.success('Você está no controle desta conversa.')
    } catch (err) {
      toast.error('Não foi possível assumir o controle. Tente novamente.')
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
      toast.success('IA reativada.')
    } catch (err) {
      toast.error('Não foi possível reativar a IA. Tente novamente.')
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
    setExcluindo(prev => new Set(prev).add(mensagemId))
    try {
      const res = await fetch(`/api/conversas/${conversaId}/mensagens/${mensagemId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Não foi possível excluir a mensagem. Tente novamente.'); return }
      setMensagens(prev => prev.map(m =>
        m.id === mensagemId
          ? { ...m, excluido: true, conteudo: null, mediaUrl: null, mediaType: null, mediaFileName: null }
          : m
      ))
    } catch (err) {
      toast.error('Não foi possível excluir a mensagem. Tente novamente.')
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

  async function atribuir(operadorId: string | null, operadorNome: string | null) {
    if (!conversaId) return
    setAtribuindo(true)
    try {
      const res = await fetch(`/api/conversas/${conversaId}/atribuir`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ operadorId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>
        toast.error((err.error as string | undefined) ?? 'Não foi possível atribuir a conversa. Tente novamente.')
        return
      }
      setAtribuidaPara(operadorId && operadorNome ? { id: operadorId, nome: operadorNome } : null)
      toast.success(operadorId ? `Conversa atribuída para ${operadorNome ?? 'operador'}.` : 'Atribuição removida.')
    } catch (err) {
      toast.error('Não foi possível atribuir a conversa. Tente novamente.')
      Sentry.captureException(err, {
        tags:  { module: 'whatsapp-chat', operation: 'atribuir' },
        extra: { conversaId, operadorId },
      })
    } finally {
      setAtribuindo(false)
    }
  }

  return {
    // state
    mensagens, pausada, conversaId, telefone, semNumero,
    texto, setTexto,
    sending, reativando, assumindo, excluindo,
    arquivos, uploading,
    naoModoIA, setNaoModoIA,
    pickerOpen, setPickerOpen,
    atribuidaPara, atribuindo,
    entity,
    // refs
    fileInputRef, bottomRef, scrollContainerRef,
    // handlers
    onScroll, handleFileChange, removerArquivo, handleDocsSistema,
    enviar, assumirControle, reativarIA, excluirMensagem, atribuir,
  }
}
