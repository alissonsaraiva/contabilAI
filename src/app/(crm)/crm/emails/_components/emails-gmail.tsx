'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { toast }                                from 'sonner'
import type { ThreadItem, MensagemThread, ClienteOpt, Aba, PainelDireito } from './emails/_shared'
import { ThreadRow }    from './emails/thread-row'
import { PainelVazio }  from './emails/painel-vazio'
import { PainelThread } from './emails/painel-thread'
import { PainelCompor } from './emails/painel-compor'

export function EmailsGmail({
  threadsEntrada:   initialEntrada,
  threadsTratados:  initialTratados,
  threadsEnviados:  initialEnviados,
  clientes,
  operadorNome,
  escritorioNome,
}: {
  threadsEntrada:  ThreadItem[]
  threadsTratados: ThreadItem[]
  threadsEnviados: ThreadItem[]
  clientes:        ClienteOpt[]
  operadorNome:    string
  escritorioNome:  string
}) {
  const [entrada,  setEntrada]  = useState(initialEntrada)
  const [tratados, setTratados] = useState(initialTratados)
  const [enviados, setEnviados] = useState(initialEnviados)
  const [aba,      setAba]      = useState<Aba>('entrada')
  const [busca,    setBusca]    = useState('')
  const [painel,   setPainel]   = useState<PainelDireito>({ tipo: 'vazio' })
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [bulkLoading,  setBulkLoading]  = useState(false)
  // Pula o reset de painel quando a mudança de aba é intencional (ex: onSent)
  const skipAbaResetRef = useRef(false)

  useEffect(() => {
    if (skipAbaResetRef.current) { skipAbaResetRef.current = false; return }
    if (painel.tipo === 'thread') setPainel({ tipo: 'vazio' })
    setSelecionados(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba])

  const lista: ThreadItem[] = useMemo(() => {
    const base = aba === 'entrada' ? entrada : aba === 'tratados' ? tratados : enviados
    if (!busca.trim()) return base
    const q = busca.toLowerCase()
    return base.filter(t =>
      t.assunto.toLowerCase().includes(q) ||
      (t.clienteNome?.toLowerCase().includes(q) ?? false) ||
      t.mensagens.some(m =>
        m.de.toLowerCase().includes(q) ||
        (m.conteudo?.toLowerCase().includes(q) ?? false)
      )
    )
  }, [aba, entrada, tratados, enviados, busca])

  function abrirThread(thread: ThreadItem) {
    setPainel({ tipo: 'thread', thread })
  }

  function abrirCompor() {
    setPainel({ tipo: 'compor' })
  }

  // Chamado após enviar uma resposta dentro de uma thread
  function onReplied(threadId: string, novaMensagem: MensagemThread) {
    function atualizar(lista: ThreadItem[]): ThreadItem[] {
      return lista.map(t => {
        if (t.threadId !== threadId) return t
        const mensagens = [...t.mensagens, novaMensagem].sort(
          (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()
        )
        // Marca todos os email_recebido como respondidos optimistically
        const mensagensRespondidas = mensagens.map(m =>
          m.tipo === 'email_recebido' && !m.respondidoEm
            ? { ...m, respondidoEm: novaMensagem.criadoEm }
            : m
        )
        return {
          ...t,
          temNaoRespondido: false,
          ultimaData:       novaMensagem.criadoEm,
          mensagens:        mensagensRespondidas,
        }
      })
    }

    const threadAtualizada = [...entrada, ...tratados].find(t => t.threadId === threadId)
    if (threadAtualizada) {
      const updated = atualizar([threadAtualizada])[0]
      skipAbaResetRef.current = true  // evita que useEffect([aba]) feche o painel
      setEntrada(prev => prev.filter(t => t.threadId !== threadId))
      setTratados(prev => [updated, ...prev.filter(t => t.threadId !== threadId)])
      setAba('tratados')
      setPainel({ tipo: 'thread', thread: updated })
    }
    toast.success('E-mail respondido!')
  }

  // Chamado ao dispensar (marcar como tratado sem responder)
  function onDispensed(threadId: string) {
    const thread = entrada.find(t => t.threadId === threadId)
    if (thread) {
      const agora = new Date().toISOString()
      const updated: ThreadItem = {
        ...thread,
        temNaoRespondido: false,
        mensagens: thread.mensagens.map(m =>
          m.tipo === 'email_recebido' && !m.respondidoEm
            ? { ...m, respondidoEm: agora }
            : m
        ),
      }
      setEntrada(prev => prev.filter(t => t.threadId !== threadId))
      setTratados(prev => [updated, ...prev])
    }
    setPainel({ tipo: 'vazio' })
  }

  function onVinculado(threadId: string, clienteId: string, clienteNome: string) {
    function atualizar(lista: ThreadItem[]): ThreadItem[] {
      return lista.map(t => t.threadId !== threadId ? t : {
        ...t, clienteId, clienteNome,
        clienteLink: `/crm/clientes/${clienteId}`,
      })
    }
    setEntrada(prev => atualizar(prev))
    setTratados(prev => atualizar(prev))
    if (painel.tipo === 'thread' && painel.thread.threadId === threadId) {
      setPainel({ tipo: 'thread', thread: { ...painel.thread, clienteId, clienteNome, clienteLink: `/crm/clientes/${clienteId}` } })
    }
  }

  function onSent(thread: ThreadItem) {
    skipAbaResetRef.current = true
    setEnviados(prev => [thread, ...prev])
    setAba('enviados')
    setPainel({ tipo: 'thread', thread })
    toast.success('E-mail enviado!')
  }

  // Remove o anexo dos rejeitados na thread (persiste estado após trocar de thread)
  function onAnexoArquivado(threadId: string, msgId: string, nome: string) {
    function atualizar(lista: ThreadItem[]): ThreadItem[] {
      return lista.map(t => t.threadId !== threadId ? t : {
        ...t,
        mensagens: t.mensagens.map(m => m.id !== msgId ? m : {
          ...m,
          anexosRejeitados: m.anexosRejeitados.filter(n => n !== nome),
        }),
      })
    }
    setEntrada(prev => atualizar(prev))
    setTratados(prev => atualizar(prev))
    setEnviados(prev => atualizar(prev))
    if (painel.tipo === 'thread' && painel.thread.threadId === threadId) {
      setPainel(prev => prev.tipo === 'thread'
        ? { ...prev, thread: atualizar([prev.thread])[0] }
        : prev
      )
    }
  }

  function toggleSelecionado(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleTodos() {
    setSelecionados(prev =>
      prev.size === lista.length ? new Set() : new Set(lista.map(t => t.threadId))
    )
  }

  async function bulkAction(action: 'dispensar' | 'excluir') {
    const threadIds = Array.from(selecionados)
    if (!threadIds.length) return
    const threadsAlvo = lista.filter(t => threadIds.includes(t.threadId))
    // Para dispensar: apenas email_recebido pendentes; para excluir: todas as mensagens da thread
    const interacaoIds = action === 'dispensar'
      ? threadsAlvo.flatMap(t => t.mensagens.filter(m => m.tipo === 'email_recebido' && !m.respondidoEm).map(m => m.id))
      : threadsAlvo.flatMap(t => t.mensagens.map(m => m.id))

    if (!interacaoIds.length && action === 'dispensar') {
      toast.info('Nenhum e-mail pendente nas threads selecionadas')
      return
    }

    setBulkLoading(true)
    try {
      const res = await fetch('/api/email/inbox/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: interacaoIds, action }),
      })
      if (!res.ok) { toast.error('Erro ao executar ação'); return }

      if (action === 'dispensar') {
        const agora = new Date().toISOString()
        setEntrada(prev => prev.filter(t => !threadIds.includes(t.threadId)))
        setTratados(prev => [
          ...lista.filter(t => threadIds.includes(t.threadId)).map(t => ({
            ...t,
            temNaoRespondido: false,
            mensagens: t.mensagens.map(m =>
              m.tipo === 'email_recebido' && !m.respondidoEm ? { ...m, respondidoEm: agora } : m
            ),
          })),
          ...prev,
        ])
        toast.success(`${threadIds.length} conversa(s) marcada(s) como tratada(s)`)
      } else {
        if (aba === 'entrada')  setEntrada(prev => prev.filter(t => !threadIds.includes(t.threadId)))
        if (aba === 'tratados') setTratados(prev => prev.filter(t => !threadIds.includes(t.threadId)))
        if (aba === 'enviados') setEnviados(prev => prev.filter(t => !threadIds.includes(t.threadId)))
        toast.success(`${threadIds.length} conversa(s) excluída(s)`)
      }

      setSelecionados(new Set())
      if (painel.tipo === 'thread' && threadIds.includes(painel.thread.threadId)) {
        setPainel({ tipo: 'vazio' })
      }
    } finally {
      setBulkLoading(false)
    }
  }

  const threadSelecionadaId = painel.tipo === 'thread' ? painel.thread.threadId : null
  const todosSelecionados   = selecionados.size > 0 && selecionados.size === lista.length
  const algumaSelecao       = selecionados.size > 0

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">

      {/* ── Coluna esquerda: lista de threads ─────────────────────────────── */}
      <div className={`flex w-full md:w-[320px] lg:w-[360px] shrink-0 flex-col border-r border-outline-variant/10 ${painel.tipo !== 'vazio' ? 'hidden md:flex' : 'flex'}`}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/10 px-4 py-3">
          <span className="text-[15px] font-semibold text-on-surface">E-mails</span>
          <button
            onClick={abrirCompor}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-all ${painel.tipo === 'compor' ? 'bg-primary text-white' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
          >
            <span className="material-symbols-outlined text-[15px]">edit</span>
            Novo
          </button>
        </div>

        {/* Abas */}
        <div className="flex overflow-x-auto scrollbar-hide border-b border-outline-variant/10 px-2 pt-2 gap-0.5">
          {([
            { key: 'entrada',  label: 'Entrada',  count: entrada.length },
            { key: 'tratados', label: 'Tratados', count: 0 },
            { key: 'enviados', label: 'Enviados', count: 0 },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-[12px] font-semibold transition-all border-b-2 ${aba === key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant/60 hover:text-on-surface'}`}
            >
              {label}
              {key === 'entrada' && count > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/40 bg-surface px-3 py-2">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">search</span>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar conversas..."
              className="flex-1 bg-transparent text-[12px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
            />
            {busca && (
              <button onClick={() => setBusca('')} className="text-on-surface-variant/40 hover:text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Toolbar bulk */}
        {algumaSelecao && (
          <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/10 bg-primary/5 px-3 py-2">
            <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} className="h-3.5 w-3.5 accent-primary cursor-pointer" />
            <span className="flex-1 text-[11px] font-semibold text-primary">{selecionados.size} selecionada{selecionados.size !== 1 ? 's' : ''}</span>
            {aba === 'entrada' && (
              <button onClick={() => bulkAction('dispensar')} disabled={bulkLoading} className="flex items-center gap-1 rounded-lg border border-outline-variant/25 bg-card px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/30 transition-colors disabled:opacity-50">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>Tratar
              </button>
            )}
            <button onClick={() => bulkAction('excluir')} disabled={bulkLoading} className="flex items-center gap-1 rounded-lg border border-outline-variant/25 bg-card px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant hover:bg-error/10 hover:text-error hover:border-error/30 transition-colors disabled:opacity-50">
              <span className="material-symbols-outlined text-[13px]">delete</span>Excluir
            </button>
            <button onClick={() => setSelecionados(new Set())} className="rounded-lg p-1 text-on-surface-variant/40 hover:text-on-surface-variant">
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        )}

        {/* Cabeçalho de seleção */}
        {!algumaSelecao && lista.length > 0 && (
          <div className="flex items-center gap-2 border-b border-outline-variant/5 px-4 py-1.5">
            <input type="checkbox" checked={false} onChange={toggleTodos} className="h-3.5 w-3.5 accent-primary cursor-pointer opacity-30 hover:opacity-80" />
            <span className="text-[10px] text-on-surface-variant/30">Selecionar todas</span>
          </div>
        )}

        {/* Lista de threads */}
        <div className="flex-1 overflow-y-auto">
          {lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/20" style={{ fontVariationSettings: "'FILL' 1" }}>
                {aba === 'enviados' ? 'send' : 'mark_email_read'}
              </span>
              <p className="text-[12px] text-on-surface-variant/40">
                {aba === 'entrada' ? 'Nenhuma conversa pendente' : aba === 'tratados' ? 'Nenhuma conversa tratada' : 'Nenhum e-mail enviado'}
              </p>
            </div>
          ) : (
            lista.map(thread => (
              <ThreadRow
                key={thread.threadId}
                thread={thread}
                aba={aba}
                selecionado={thread.threadId === threadSelecionadaId}
                marcado={selecionados.has(thread.threadId)}
                onToggle={(e) => toggleSelecionado(thread.threadId, e)}
                onClick={() => { if (!selecionados.size) abrirThread(thread) }}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Coluna direita: painel ─────────────────────────────────────────── */}
      <div className={`flex flex-1 flex-col overflow-hidden ${painel.tipo === 'vazio' ? 'hidden md:flex' : 'flex'}`}>
        {painel.tipo === 'vazio' && <PainelVazio onCompor={abrirCompor} />}
        {painel.tipo === 'thread' && (
          <PainelThread
            thread={painel.thread}
            aba={aba}
            clientes={clientes}
            operadorNome={operadorNome}
            escritorioNome={escritorioNome}
            onReplied={onReplied}
            onDispensed={onDispensed}
            onVinculado={onVinculado}
            onAnexoArquivado={onAnexoArquivado}
            onBack={() => setPainel({ tipo: 'vazio' })}
          />
        )}
        {painel.tipo === 'compor' && (
          <PainelCompor clientes={clientes} onSent={onSent} onClose={() => setPainel({ tipo: 'vazio' })} />
        )}
      </div>
    </div>
  )
}
