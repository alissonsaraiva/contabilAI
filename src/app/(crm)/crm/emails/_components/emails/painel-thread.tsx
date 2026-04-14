'use client'

import { useState, useEffect, useRef } from 'react'
import Link                             from 'next/link'
import { toast }                        from 'sonner'
import type { ThreadItem, MensagemThread, Aba, ClienteOpt, VincularEstado } from './_shared'
import { MensagemBubble }               from './mensagem-bubble'

export type OperadorEmailOpcao = { id: string; nome: string; tipo: string }

export function PainelThread({ thread, aba, clientes, operadores, operadorNome, escritorioNome, onReplied, onDispensed, onVinculado, onAnexoArquivado, onAtribuido, onBack }: {
  thread:            ThreadItem
  aba:               Aba
  clientes:          ClienteOpt[]
  operadores:        OperadorEmailOpcao[]
  operadorNome:      string
  escritorioNome:    string
  onReplied:         (threadId: string, msg: MensagemThread) => void
  onDispensed:       (threadId: string) => void
  onVinculado:       (threadId: string, clienteId: string, clienteNome: string) => void
  onAnexoArquivado:  (threadId: string, msgId: string, nome: string) => void
  onAtribuido:       (threadId: string, atribuidaPara: { id: string; nome: string } | null) => void
  onBack:            () => void
}) {
  const [resposta,       setResposta]       = useState('')
  const [assuntoResp,    setAssuntoResp]    = useState(`Re: ${thread.assunto.replace(/^(Re:\s*)+/i, '')}`)
  const [paraResp,       setParaResp]       = useState('')
  const [enviando,       setEnviando]       = useState(false)
  const [respondendo,    setRespondendo]    = useState(false)
  const [usouSugestao,   setUsouSugestao]   = useState(false)
  const [dispensando,    setDispensando]    = useState(false)
  const [vincularEstado, setVincularEstado] = useState<VincularEstado>('idle')
  const [vincularBusca,  setVincularBusca]  = useState('')
  const [vincularClienteId, setVincularClienteId] = useState('')
  const [arquivandoAnexos,  setArquivandoAnexos]  = useState<Set<string>>(new Set())
  const [anexosArquivados,  setAnexosArquivados]  = useState<Set<string>>(new Set())
  const [atribDropdown,  setAtribDropdown]  = useState(false)
  const [atribuindo,     setAtribuindo]     = useState(false)
  const atribDropdownRef = useRef<HTMLDivElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)

  // Último email recebido sem resposta (para reply-to e sugestão)
  const ultimoRecebidoPendente = [...thread.mensagens]
    .reverse()
    .find(m => m.tipo === 'email_recebido' && !m.respondidoEm)

  const sugestao = ultimoRecebidoPendente?.sugestao ?? null

  useEffect(() => {
    setResposta('')
    setAssuntoResp(`Re: ${thread.assunto.replace(/^(Re:\s*)+/i, '')}`)
    setParaResp(ultimoRecebidoPendente?.de ?? '')
    setUsouSugestao(false)
    setRespondendo(false)
    setVincularEstado('idle')
    setVincularBusca('')
    setVincularClienteId('')
    setArquivandoAnexos(new Set())
    setAnexosArquivados(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.threadId])

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!atribDropdown) return
    function handler(e: MouseEvent) {
      if (atribDropdownRef.current && !atribDropdownRef.current.contains(e.target as Node)) {
        setAtribDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [atribDropdown])

  // Scroll para o final da thread
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread.mensagens.length])

  async function atribuirThread(operadorId: string | null, operadorNome: string | null) {
    if (atribuindo) return  // guard: ignora clique duplo enquanto requisição anterior está em andamento
    setAtribDropdown(false)
    setAtribuindo(true)
    try {
      const res = await fetch(`/api/email/inbox/${thread.interacaoRaizId}/atribuir`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ operadorId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as Record<string, unknown>
        toast.error((d.error as string | undefined) ?? 'Erro ao atribuir')
        return
      }
      onAtribuido(
        thread.threadId,
        operadorId && operadorNome ? { id: operadorId, nome: operadorNome } : null,
      )
      toast.success(operadorId ? `Atribuído para ${operadorNome}` : 'Atribuição removida')
    } finally {
      setAtribuindo(false)
    }
  }

  const isPendente = aba === 'entrada' && thread.temNaoRespondido

  // Último messageId recebido (para In-Reply-To)
  const ultimoMessageId = [...thread.mensagens]
    .reverse()
    .find(m => m.messageId)
    ?.messageId ?? null

  async function enviarResposta() {
    if (!paraResp.trim() || !assuntoResp.trim() || !resposta.trim()) return
    setEnviando(true)
    try {
      // IDs das interacoes pendentes para marcar como respondido
      const pendentesIds = thread.mensagens
        .filter(m => m.tipo === 'email_recebido' && !m.respondidoEm)
        .map(m => m.id)

      const res = await fetch('/api/email/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para:               paraResp,
          assunto:            assuntoResp,
          corpo:              resposta,
          clienteId:          thread.clienteId ?? undefined,
          leadId:             thread.leadId    ?? undefined,
          interacaoOrigemId:  pendentesIds[0],
          inReplyToMessageId: ultimoMessageId ?? undefined,
          emailThreadId:      thread.threadId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'Erro ao enviar e-mail')
        return
      }

      const novaMensagem: MensagemThread = {
        id:               crypto.randomUUID(),
        tipo:             'email_enviado',
        conteudo:         resposta,
        criadoEm:         new Date().toISOString(),
        respondidoEm:     null,
        de:               '',
        para:             paraResp,
        nomeRemetente:    operadorNome,
        assunto:          assuntoResp,
        messageId:        null,
        anexos:           [],
        anexosRejeitados: [],
        sugestao:         null,
        origem:           'usuario',
      }
      onReplied(thread.threadId, novaMensagem)
    } finally {
      setEnviando(false)
    }
  }

  async function dispensar() {
    const pendentesIds = thread.mensagens
      .filter(m => m.tipo === 'email_recebido' && !m.respondidoEm)
      .map(m => m.id)
    if (!pendentesIds.length) return
    setDispensando(true)
    try {
      const res = await fetch('/api/email/inbox/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: pendentesIds, action: 'dispensar' }),
      })
      if (!res.ok) { toast.error('Erro ao marcar como tratado'); return }
      onDispensed(thread.threadId)
    } finally {
      setDispensando(false)
    }
  }

  async function vincular() {
    if (!vincularClienteId) return
    setVincularEstado('salvando')
    // Vincula todos os email_recebido da thread (thread multi-turno pode ter vários)
    const emailsParaVincular = thread.mensagens.filter(m => m.tipo === 'email_recebido')
    if (!emailsParaVincular.length) return
    try {
      // Primeiro email: usa resposta para obter clienteNome
      const res = await fetch(`/api/email/inbox/${emailsParaVincular[0]!.id}/vincular`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ clienteId: vincularClienteId }),
      })
      if (!res.ok) { toast.error('Erro ao vincular'); return }
      const d = await res.json()
      // Demais emails da thread (ignora 409 — já vinculados)
      if (emailsParaVincular.length > 1) {
        await Promise.allSettled(
          emailsParaVincular.slice(1).map(m =>
            fetch(`/api/email/inbox/${m.id}/vincular`, {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ clienteId: vincularClienteId }),
            })
          )
        )
      }
      onVinculado(thread.threadId, vincularClienteId, d.clienteNome ?? '')
      toast.success('Conversa vinculada ao cliente!')
    } finally {
      setVincularEstado('idle')
    }
  }

  async function arquivarAnexo(msgId: string, nome: string, url: string, mimeType: string) {
    const key = `${msgId}::${nome}`
    setArquivandoAnexos(prev => new Set([...prev, key]))
    try {
      const res = await fetch(`/api/email/inbox/${msgId}/arquivar-anexo`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nome, url, mimeType }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'Erro ao arquivar anexo')
        return
      }
      setAnexosArquivados(prev => new Set([...prev, key]))
      onAnexoArquivado(thread.threadId, msgId, nome)
      toast.success(`"${nome}" arquivado na ficha do cliente`)
    } catch {
      toast.error('Erro ao arquivar anexo')
    } finally {
      setArquivandoAnexos(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Header da thread ─────────────────────────────────────────────── */}
      <div className="border-b border-outline-variant/10 px-4 md:px-6 py-4">
        <div className="flex items-start gap-3 flex-col md:flex-row">
          <div className="flex items-center gap-2 w-full md:w-auto flex-1">
            <button onClick={onBack} className="md:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors">
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] md:text-[16px] font-semibold text-on-surface leading-snug line-clamp-2">
                {thread.assunto || '(sem assunto)'}
              </h2>
              <p className="text-[11px] text-on-surface-variant/50 mt-0.5">
                {thread.mensagens.length} {thread.mensagens.length === 1 ? 'mensagem' : 'mensagens'}
                {thread.clienteNome && ` · ${thread.clienteNome}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 w-full md:w-auto flex-wrap items-center gap-2">
            {thread.clienteLink && (
              <Link href={thread.clienteLink} className="flex items-center gap-1.5 rounded-xl border border-outline-variant/25 px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container">
                <span className="material-symbols-outlined text-[14px]">person</span>
                {thread.clienteNome ?? 'Ver cliente'}
              </Link>
            )}

            {/* Dropdown de atribuição */}
            <div ref={atribDropdownRef} className="relative">
              <button
                onClick={() => setAtribDropdown(v => !v)}
                disabled={atribuindo}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                  thread.atribuidaPara
                    ? 'border-violet-500/30 bg-violet-500/10 text-violet-600 hover:bg-violet-500/20'
                    : 'border-outline-variant/25 bg-surface-container-low text-on-surface-variant/70 hover:bg-surface-container hover:text-on-surface'
                }`}
                title={thread.atribuidaPara ? `Atribuído: ${thread.atribuidaPara.nome}` : 'Atribuir'}
              >
                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>person_pin</span>
                <span className="max-w-[7rem] truncate">
                  {atribuindo ? 'Salvando...' : (thread.atribuidaPara?.nome ?? 'Atribuir')}
                </span>
                <span className="material-symbols-outlined text-[11px]">expand_more</span>
              </button>
              {atribDropdown && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-[12px] border border-outline-variant/15 bg-card shadow-lg">
                  <div className="px-3 pt-2.5 pb-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/50">Atribuir para</p>
                  </div>
                  <div className="max-h-52 overflow-y-auto py-1">
                    {operadores.map(op => (
                      <button
                        key={op.id}
                        onClick={() => void atribuirThread(op.id, op.nome)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors hover:bg-surface-container-low ${
                          thread.atribuidaPara?.id === op.id ? 'font-semibold text-violet-600' : 'text-on-surface'
                        }`}
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-[9px] font-bold text-violet-600">
                          {op.nome.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 truncate">{op.nome}</span>
                        {thread.atribuidaPara?.id === op.id && (
                          <span className="material-symbols-outlined text-[14px] text-violet-600">check</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {thread.atribuidaPara && (
                    <>
                      <div className="mx-3 border-t border-outline-variant/10" />
                      <div className="py-1">
                        <button
                          onClick={() => void atribuirThread(null, null)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-on-surface-variant/60 transition-colors hover:bg-surface-container-low hover:text-error"
                        >
                          <span className="material-symbols-outlined text-[14px]">person_remove</span>
                          Remover atribuição
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {isPendente && (
              <button onClick={dispensar} disabled={dispensando} title="Marcar como tratado sem responder" className="flex items-center gap-1.5 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant/70 transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-50">
                {dispensando
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-surface-variant/20 border-t-on-surface-variant/60" />
                  : <span className="material-symbols-outlined text-[14px]">check_circle_outline</span>}
                Marcar como tratado
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Corpo: mensagens da thread ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">

        {/* Vincular ao cliente (só para threads sem vínculo) */}
        {isPendente && !thread.clienteId && !thread.leadId && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[16px] text-amber-500/80">link</span>
              <p className="text-[12px] font-semibold text-amber-500/90">Conversa não vinculada a nenhum cliente</p>
            </div>
            {vincularEstado === 'idle' ? (
              <button onClick={() => setVincularEstado('selecionando')} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] font-semibold text-amber-500/80 hover:bg-amber-500/20 transition-colors">
                Vincular ao cliente
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input value={vincularBusca} onChange={e => { setVincularBusca(e.target.value); setVincularClienteId('') }} placeholder="Buscar cliente..." autoFocus className="rounded-xl border border-outline-variant/50 bg-surface px-3 py-2 text-[12px] text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all" />
                {vincularBusca.trim().length >= 2 && (
                  <div className="rounded-xl border border-outline-variant/20 bg-card shadow-sm overflow-hidden max-h-40 overflow-y-auto">
                    {clientes.filter(c => c.nome.toLowerCase().includes(vincularBusca.toLowerCase()) || (c.email?.toLowerCase().includes(vincularBusca.toLowerCase()) ?? false)).slice(0, 6).map(c => (
                      <button key={c.id} onClick={() => { setVincularClienteId(c.id); setVincularBusca(c.nome) }} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[12px] transition-colors hover:bg-surface-container-low ${vincularClienteId === c.id ? 'bg-primary/8' : ''}`}>
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <span className="text-[10px] font-bold text-primary">{c.nome.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium text-on-surface">{c.nome}</p>
                          {c.email && <p className="truncate text-[10px] text-on-surface-variant/60">{c.email}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-1">
                  <button onClick={() => { setVincularEstado('idle'); setVincularBusca(''); setVincularClienteId('') }} className="rounded-xl border border-outline-variant/25 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">Cancelar</button>
                  <button onClick={vincular} disabled={!vincularClienteId || vincularEstado === 'salvando'} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {vincularEstado === 'salvando' ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <span className="material-symbols-outlined text-[13px]">link</span>}
                    Vincular
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mensagens da thread */}
        {thread.mensagens.map((msg) => (
          <MensagemBubble
            key={msg.id}
            msg={msg}
            thread={thread}
            arquivandoAnexos={arquivandoAnexos}
            anexosArquivados={anexosArquivados}
            onArquivarAnexo={arquivarAnexo}
          />
        ))}
        <div ref={threadEndRef} />
      </div>

      {/* ── Área de resposta ─────────────────────────────────────────────── */}
      {isPendente && (
        <div className="border-t border-outline-variant/10">
          {!respondendo ? (
            <div className="px-4 md:px-6 py-4">
              {sugestao && !usouSugestao && (
                <button
                  onClick={() => {
                    const texto = sugestao
                      .replace(/\[NOME_OPERADOR\]/g, operadorNome)
                      .replace(/\[NOME_ESCRITORIO\]/g, escritorioNome)
                    setResposta(texto); setUsouSugestao(true); setRespondendo(true)
                  }}
                  className="mb-3 flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
                >
                  <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-primary">Usar sugestão da IA</p>
                    <p className="truncate text-[11px] text-on-surface-variant/60">{sugestao?.slice(0, 100)}…</p>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-primary/60 shrink-0">arrow_forward</span>
                </button>
              )}
              <button onClick={() => setRespondendo(true)} className="flex w-full items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-[13px] text-on-surface-variant/50 hover:border-primary/30 hover:text-on-surface transition-all">
                <span className="material-symbols-outlined text-[16px]">reply</span>
                Clique para responder…
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-4 md:px-6 py-4">
              {usouSugestao && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-1.5">
                  <span className="material-symbols-outlined text-[13px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  <span className="text-[11px] text-primary font-medium">Sugestão da IA aplicada</span>
                  <button onClick={() => { setResposta(''); setUsouSugestao(false) }} className="ml-auto text-[11px] text-on-surface-variant/50 hover:text-on-surface transition-colors">limpar</button>
                </div>
              )}
              <div className="flex flex-col md:flex-row gap-2">
                <input value={paraResp} onChange={e => setParaResp(e.target.value)} className="flex-1 rounded-xl border border-outline-variant/50 bg-surface px-3 py-2 text-[12px] text-on-surface focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all" placeholder="Para" />
                <input value={assuntoResp} onChange={e => setAssuntoResp(e.target.value)} className="flex-1 rounded-xl border border-outline-variant/50 bg-surface px-3 py-2 text-[12px] text-on-surface focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all" placeholder="Assunto" />
              </div>
              <textarea value={resposta} onChange={e => setResposta(e.target.value)} rows={5} placeholder="Escreva sua resposta..." autoFocus className="w-full resize-none rounded-xl border border-outline-variant/50 bg-surface px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all" />
              <div className="flex items-center gap-2">
                <button onClick={() => setRespondendo(false)} className="rounded-xl border border-outline-variant/25 px-4 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">Cancelar</button>
                <button onClick={enviarResposta} disabled={enviando || !paraResp.trim() || !assuntoResp.trim() || !resposta.trim()} className="ml-auto flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition-all">
                  {enviando ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>}
                  Enviar resposta
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
