'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type EmailItem = {
  id: string
  tipo: 'email_recebido' | 'email_enviado'
  titulo: string | null
  conteudo: string | null
  criadoEm: string
  respondidoEm: string | null
  clienteId: string | null
  leadId: string | null
  clienteNome: string | null
  clienteLink: string | null
  metadados: {
    de: string
    para: string
    nomeRemetente: string | null
    assunto: string
    messageId: string | null
    dataEnvio: string | null
    anexos: Array<{ nome: string; url: string; mimeType: string }>
    sugestao: string | null
  }
}

type ClienteOpt = { id: string; nome: string; email: string | null }
type Aba = 'recebidos' | 'respondidos' | 'enviados'
type PainelDireito = { tipo: 'vazio' } | { tipo: 'email'; email: EmailItem } | { tipo: 'compor' }
type VincularEstado = 'idle' | 'selecionando' | 'salvando'

// ─── Componente principal ─────────────────────────────────────────────────────

export function EmailsGmail({
  recebidos: initialRecebidos,
  respondidos: initialRespondidos,
  enviados: initialEnviados,
  clientes,
}: {
  recebidos:   EmailItem[]
  respondidos: EmailItem[]
  enviados:    EmailItem[]
  clientes:    ClienteOpt[]
}) {
  const [recebidos,   setRecebidos]   = useState(initialRecebidos)
  const [respondidos, setRespondidos] = useState(initialRespondidos)
  const [enviados,    setEnviados]    = useState(initialEnviados)
  const [aba, setAba]                 = useState<Aba>('recebidos')
  const [busca, setBusca]             = useState('')
  const [painel, setPainel]           = useState<PainelDireito>({ tipo: 'vazio' })
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading]   = useState(false)

  // Limpa seleção e painel ao mudar de aba
  useEffect(() => {
    if (painel.tipo === 'email') setPainel({ tipo: 'vazio' })
    setSelecionados(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba])

  const lista: EmailItem[] = useMemo(() => {
    const base = aba === 'recebidos' ? recebidos : aba === 'respondidos' ? respondidos : enviados
    if (!busca.trim()) return base
    const q = busca.toLowerCase()
    return base.filter(e =>
      e.metadados.assunto.toLowerCase().includes(q) ||
      e.metadados.de.toLowerCase().includes(q) ||
      (e.clienteNome?.toLowerCase().includes(q) ?? false) ||
      (e.conteudo?.toLowerCase().includes(q) ?? false)
    )
  }, [aba, recebidos, respondidos, enviados, busca])

  function abrirEmail(email: EmailItem) {
    setPainel({ tipo: 'email', email })
  }

  function abrirCompor() {
    setPainel({ tipo: 'compor' })
  }

  function onReplied(id: string) {
    const email = recebidos.find(e => e.id === id)
    if (email) {
      setRecebidos(prev => prev.filter(e => e.id !== id))
      setRespondidos(prev => [{ ...email, respondidoEm: new Date().toISOString() }, ...prev])
    }
    setPainel({ tipo: 'vazio' })
    toast.success('E-mail respondido!')
  }

  function onDispensed(id: string) {
    const email = recebidos.find(e => e.id === id)
    if (email) {
      setRecebidos(prev => prev.filter(e => e.id !== id))
      setRespondidos(prev => [{ ...email, respondidoEm: new Date().toISOString() }, ...prev])
    }
    setPainel({ tipo: 'vazio' })
  }

  function onSent(emailEnviado: EmailItem) {
    setEnviados(prev => [emailEnviado, ...prev])
    setPainel({ tipo: 'vazio' })
    toast.success('E-mail enviado!')
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
      prev.size === lista.length ? new Set() : new Set(lista.map(e => e.id))
    )
  }

  async function bulkAction(action: 'dispensar' | 'excluir') {
    const ids = Array.from(selecionados)
    if (!ids.length) return
    setBulkLoading(true)
    try {
      const res = await fetch('/api/email/inbox/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids, action }),
      })
      if (!res.ok) { toast.error('Erro ao executar ação'); return }

      if (action === 'dispensar') {
        const agora = new Date().toISOString()
        const movidos = recebidos.filter(e => ids.includes(e.id)).map(e => ({ ...e, respondidoEm: agora }))
        setRecebidos(prev => prev.filter(e => !ids.includes(e.id)))
        setRespondidos(prev => [...movidos, ...prev])
        toast.success(`${ids.length} e-mail(s) marcados como tratados`)
      } else {
        // excluir: remove da lista atual
        if (aba === 'recebidos')   setRecebidos(prev => prev.filter(e => !ids.includes(e.id)))
        if (aba === 'respondidos') setRespondidos(prev => prev.filter(e => !ids.includes(e.id)))
        if (aba === 'enviados')    setEnviados(prev => prev.filter(e => !ids.includes(e.id)))
        toast.success(`${ids.length} e-mail(s) excluídos`)
      }

      setSelecionados(new Set())
      if (painel.tipo === 'email' && ids.includes(painel.email.id)) setPainel({ tipo: 'vazio' })
    } finally {
      setBulkLoading(false)
    }
  }

  const emailSelecionadoId = painel.tipo === 'email' ? painel.email.id : null
  const todosSelecionados   = selecionados.size > 0 && selecionados.size === lista.length
  const algumaSelecao       = selecionados.size > 0

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">

      {/* ── Coluna esquerda: lista ─────────────────────────────────────────── */}
      <div className="flex w-[320px] shrink-0 flex-col border-r border-outline-variant/10">

        {/* Header da coluna */}
        <div className="flex items-center justify-between border-b border-outline-variant/10 px-4 py-3">
          <span className="text-[15px] font-semibold text-on-surface">E-mails</span>
          <button
            onClick={abrirCompor}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-all ${
              painel.tipo === 'compor'
                ? 'bg-primary text-white'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            <span className="material-symbols-outlined text-[15px]">edit</span>
            Novo
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-outline-variant/10 px-2 pt-2 gap-0.5">
          {([
            { key: 'recebidos',   label: 'Entrada',   count: recebidos.length },
            { key: 'respondidos', label: 'Tratados',  count: 0 },
            { key: 'enviados',    label: 'Enviados',  count: 0 },
          ] as const).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-[12px] font-semibold transition-all border-b-2 ${
                aba === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant/60 hover:text-on-surface'
              }`}
            >
              {label}
              {key === 'recebidos' && count > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                  {count}
                </span>
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
              placeholder="Buscar e-mails..."
              className="flex-1 bg-transparent text-[12px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
            />
            {busca && (
              <button onClick={() => setBusca('')} className="text-on-surface-variant/40 hover:text-on-surface-variant transition-colors">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Toolbar bulk — aparece quando há seleção */}
        {algumaSelecao && (
          <div className="flex items-center gap-2 border-b border-outline-variant/10 bg-primary/5 px-3 py-2">
            <input
              type="checkbox"
              checked={todosSelecionados}
              onChange={toggleTodos}
              className="h-3.5 w-3.5 accent-primary cursor-pointer"
            />
            <span className="flex-1 text-[11px] font-semibold text-primary">
              {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
            </span>
            {aba === 'recebidos' && (
              <button
                onClick={() => bulkAction('dispensar')}
                disabled={bulkLoading}
                className="flex items-center gap-1 rounded-lg border border-outline-variant/25 bg-card px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/30 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                Tratar
              </button>
            )}
            <button
              onClick={() => bulkAction('excluir')}
              disabled={bulkLoading}
              className="flex items-center gap-1 rounded-lg border border-outline-variant/25 bg-card px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant hover:bg-error/10 hover:text-error hover:border-error/30 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[13px]">delete</span>
              Excluir
            </button>
            <button
              onClick={() => setSelecionados(new Set())}
              className="rounded-lg p-1 text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        )}

        {/* Cabeçalho de seleção geral (quando nada selecionado ainda) */}
        {!algumaSelecao && lista.length > 0 && (
          <div className="flex items-center gap-2 border-b border-outline-variant/5 px-4 py-1.5">
            <input
              type="checkbox"
              checked={false}
              onChange={toggleTodos}
              className="h-3.5 w-3.5 accent-primary cursor-pointer opacity-30 hover:opacity-80"
            />
            <span className="text-[10px] text-on-surface-variant/30">Selecionar todos</span>
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/20"
                style={{ fontVariationSettings: "'FILL' 1" }}>
                {aba === 'enviados' ? 'send' : 'mark_email_read'}
              </span>
              <p className="text-[12px] text-on-surface-variant/40">
                {aba === 'recebidos' ? 'Nenhum e-mail pendente' : 'Nenhum registro'}
              </p>
            </div>
          ) : (
            lista.map(email => (
              <EmailRow
                key={email.id}
                email={email}
                aba={aba}
                selecionado={email.id === emailSelecionadoId}
                marcado={selecionados.has(email.id)}
                onToggle={(e) => toggleSelecionado(email.id, e)}
                onClick={() => { if (!selecionados.size) abrirEmail(email) }}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Coluna direita: painel ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {painel.tipo === 'vazio' && (
          <PainelVazio onCompor={abrirCompor} />
        )}
        {painel.tipo === 'email' && (
          <PainelEmail
            email={painel.email}
            aba={aba}
            clientes={clientes}
            onReplied={onReplied}
            onDispensed={onDispensed}
            onVinculado={(id, clienteId, clienteNome) => {
              const atualizar = (lista: EmailItem[]) =>
                lista.map(e => e.id === id
                  ? { ...e, clienteId, clienteNome, clienteLink: `/crm/clientes/${clienteId}` }
                  : e
                )
              setRecebidos(prev => atualizar(prev))
              if (painel.tipo === 'email' && painel.email.id === id) {
                setPainel({ tipo: 'email', email: { ...painel.email, clienteId, clienteNome, clienteLink: `/crm/clientes/${clienteId}` } })
              }
            }}
          />
        )}
        {painel.tipo === 'compor' && (
          <PainelCompor
            clientes={clientes}
            onSent={onSent}
            onClose={() => setPainel({ tipo: 'vazio' })}
          />
        )}
      </div>
    </div>
  )
}

// ─── Row compacto da lista ────────────────────────────────────────────────────

function EmailRow({ email, aba, selecionado, marcado, onToggle, onClick }: {
  email:     EmailItem
  aba:       Aba
  selecionado: boolean
  marcado:   boolean
  onToggle:  (e: React.MouseEvent) => void
  onClick:   () => void
}) {
  const isEnviado    = email.tipo === 'email_enviado'
  const remetente    = isEnviado
    ? (email.metadados.para || email.clienteNome || 'Destinatário')
    : (email.metadados.nomeRemetente ?? email.metadados.de)
  const dataFormatada = new Date(email.metadados.dataEnvio ?? email.criadoEm)
    .toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const naoLido = aba === 'recebidos'

  return (
    <button
      onClick={onClick}
      className={`group flex w-full flex-col gap-1 border-b border-outline-variant/8 px-4 py-3 text-left transition-all ${
        marcado
          ? 'bg-primary/6 border-l-2 border-l-primary'
          : selecionado
            ? 'bg-primary/8 border-l-2 border-l-primary'
            : 'hover:bg-surface-container-low/60'
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Checkbox — visível no hover ou quando marcado */}
        <span
          onClick={onToggle}
          className={`shrink-0 transition-opacity ${marcado ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          style={{ lineHeight: 0 }}
        >
          <input
            type="checkbox"
            checked={marcado}
            onChange={() => {/* controlado pelo onClick */}}
            className="h-3.5 w-3.5 accent-primary cursor-pointer"
          />
        </span>
        {/* Dot não lido — oculto quando o checkbox está visível */}
        {naoLido && !marcado && (
          <div className="h-2 w-2 shrink-0 rounded-full bg-primary group-hover:hidden" />
        )}
        <span className={`flex-1 truncate text-[12px] ${naoLido ? 'font-bold text-on-surface' : 'font-medium text-on-surface/80'}`}>
          {remetente}
        </span>
        <span className="shrink-0 text-[10px] text-on-surface-variant/40">{dataFormatada}</span>
      </div>
      <p className={`truncate text-[11px] ${naoLido ? 'font-semibold text-on-surface/90' : 'text-on-surface-variant/70'}`}>
        {email.metadados.assunto || '(sem assunto)'}
      </p>
      <p className="truncate text-[11px] text-on-surface-variant/50 leading-relaxed">
        {email.conteudo?.slice(0, 80)}
      </p>
      {!isEnviado && (
        email.clienteNome
          ? (
            <span className="self-start rounded-full bg-surface-container px-2 py-0.5 text-[9px] text-on-surface-variant/50">
              {email.clienteNome}
            </span>
          ) : aba === 'recebidos' && (
            <span className="self-start rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-500/80">
              Sem vínculo
            </span>
          )
      )}
    </button>
  )
}

// ─── Painel: estado vazio ─────────────────────────────────────────────────────

function PainelVazio({ onCompor }: { onCompor: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container-low">
        <span className="material-symbols-outlined text-[32px] text-on-surface-variant/30"
          style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
      </div>
      <div>
        <p className="text-[14px] font-semibold text-on-surface/60">Selecione um e-mail</p>
        <p className="mt-1 text-[12px] text-on-surface-variant/40">ou compose um novo</p>
      </div>
      <button
        onClick={onCompor}
        className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/20 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">edit</span>
        Novo e-mail
      </button>
    </div>
  )
}

// ─── Painel: leitura + resposta ───────────────────────────────────────────────

function PainelEmail({ email, aba, clientes, onReplied, onDispensed, onVinculado }: {
  email: EmailItem
  aba: Aba
  clientes: ClienteOpt[]
  onReplied: (id: string) => void
  onDispensed: (id: string) => void
  onVinculado: (id: string, clienteId: string, clienteNome: string) => void
}) {
  const [resposta, setResposta]       = useState('')
  const [assuntoResp, setAssuntoResp] = useState(`Re: ${email.metadados.assunto}`)
  const [paraResp, setParaResp]       = useState(email.metadados.de)
  const [enviando, setEnviando]       = useState(false)
  const [dispensando, setDispensando] = useState(false)
  const [usouSugestao, setUsouSugestao] = useState(false)
  const [repondendo, setRespondendo]  = useState(false)
  const [vincularEstado, setVincularEstado] = useState<VincularEstado>('idle')
  const [vincularBusca, setVincularBusca]   = useState('')
  const [vincularClienteId, setVincularClienteId] = useState('')

  // Reset ao trocar de email
  useEffect(() => {
    setResposta('')
    setAssuntoResp(`Re: ${email.metadados.assunto}`)
    setParaResp(email.metadados.de)
    setUsouSugestao(false)
    setRespondendo(false)
    setVincularEstado('idle')
    setVincularBusca('')
    setVincularClienteId('')
  }, [email.id, email.metadados.assunto, email.metadados.de])

  const isRecebido = email.tipo === 'email_recebido'
  const isPendente = aba === 'recebidos'

  async function enviarResposta() {
    if (!paraResp.trim() || !assuntoResp.trim() || !resposta.trim()) return
    setEnviando(true)
    try {
      const res = await fetch('/api/email/enviar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          para:              paraResp,
          assunto:           assuntoResp,
          corpo:             resposta,
          clienteId:         email.clienteId ?? undefined,
          leadId:            email.leadId    ?? undefined,
          interacaoOrigemId: email.id,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'Erro ao enviar e-mail')
        return
      }
      onReplied(email.id)
    } finally {
      setEnviando(false)
    }
  }

  async function vincular() {
    if (!vincularClienteId) return
    setVincularEstado('salvando')
    try {
      const res = await fetch(`/api/email/inbox/${email.id}/vincular`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ clienteId: vincularClienteId }),
      })
      if (!res.ok) { toast.error('Erro ao vincular e-mail'); return }
      const d = await res.json()
      onVinculado(email.id, vincularClienteId, d.clienteNome ?? '')
      toast.success('E-mail vinculado ao cliente!')
    } finally {
      setVincularEstado('idle')
    }
  }

  async function dispensar() {
    setDispensando(true)
    try {
      const res = await fetch(`/api/email/inbox/${email.id}/dispensar`, { method: 'PATCH' })
      if (!res.ok) { toast.error('Erro ao marcar como tratado'); return }
      onDispensed(email.id)
    } finally {
      setDispensando(false)
    }
  }

  const dataFormatada = new Date(email.metadados.dataEnvio ?? email.criadoEm)
    .toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header do e-mail */}
      <div className="border-b border-outline-variant/10 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[16px] font-semibold text-on-surface leading-snug flex-1">
            {email.metadados.assunto || '(sem assunto)'}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {email.clienteLink && (
              <Link
                href={email.clienteLink}
                className="flex items-center gap-1.5 rounded-xl border border-outline-variant/25 px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[14px]">person</span>
                {email.clienteNome ?? 'Ver cliente'}
              </Link>
            )}
            {isPendente && (
              <button
                onClick={dispensar}
                disabled={dispensando}
                title="Marcar como tratado sem responder"
                className="flex items-center gap-1.5 rounded-xl border border-outline-variant/25 px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                {dispensando
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-surface-variant/20 border-t-on-surface-variant/60" />
                  : <span className="material-symbols-outlined text-[14px]">check_circle</span>}
                Tratado
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-on-surface-variant/60">
          <span>
            {isRecebido ? 'De:' : 'Para:'}{' '}
            <span className="font-medium text-on-surface/80">
              {isRecebido
                ? (email.metadados.nomeRemetente
                    ? `${email.metadados.nomeRemetente} <${email.metadados.de}>`
                    : email.metadados.de)
                : email.metadados.para}
            </span>
          </span>
          <span>{dataFormatada}</span>
        </div>

        {/* Anexos */}
        {email.metadados.anexos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {email.metadados.anexos.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container px-2.5 py-1 text-[11px] text-on-surface-variant/70 hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[13px]">attach_file</span>
                {a.nome}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Corpo do e-mail */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-on-surface/80">
          {email.conteudo}
        </p>

        {/* Vincular ao cliente (só para emails não identificados) */}
        {isPendente && isRecebido && !email.clienteId && !email.leadId && (
          <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[16px] text-amber-500/80">link</span>
              <p className="text-[12px] font-semibold text-amber-500/90">E-mail não vinculado a nenhum cliente</p>
            </div>
            {vincularEstado === 'idle' ? (
              <button
                onClick={() => setVincularEstado('selecionando')}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] font-semibold text-amber-500/80 hover:bg-amber-500/20 transition-colors"
              >
                Vincular ao cliente
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={vincularBusca}
                  onChange={e => { setVincularBusca(e.target.value); setVincularClienteId('') }}
                  placeholder="Buscar cliente..."
                  autoFocus
                  className="rounded-xl border border-outline-variant/50 bg-surface px-3 py-2 text-[12px] text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
                />
                {vincularBusca.trim().length >= 2 && (
                  <div className="rounded-xl border border-outline-variant/20 bg-card shadow-sm overflow-hidden max-h-40 overflow-y-auto">
                    {clientes
                      .filter(c =>
                        c.nome.toLowerCase().includes(vincularBusca.toLowerCase()) ||
                        (c.email?.toLowerCase().includes(vincularBusca.toLowerCase()) ?? false)
                      )
                      .slice(0, 6)
                      .map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setVincularClienteId(c.id); setVincularBusca(c.nome) }}
                          className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[12px] transition-colors hover:bg-surface-container-low ${vincularClienteId === c.id ? 'bg-primary/8' : ''}`}
                        >
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
                  <button
                    onClick={() => { setVincularEstado('idle'); setVincularBusca(''); setVincularClienteId('') }}
                    className="rounded-xl border border-outline-variant/25 px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={vincular}
                    disabled={!vincularClienteId || vincularEstado === 'salvando'}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {vincularEstado === 'salvando'
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      : <span className="material-symbols-outlined text-[13px]">link</span>}
                    Vincular
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Área de resposta (só para recebidos pendentes) */}
      {isPendente && isRecebido && (
        <div className="border-t border-outline-variant/10">
          {!repondendo ? (
            <div className="px-6 py-4">
              {/* Sugestão da IA */}
              {email.metadados.sugestao && !usouSugestao && (
                <button
                  onClick={() => { setResposta(email.metadados.sugestao!); setUsouSugestao(true); setRespondendo(true) }}
                  className="mb-3 flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
                >
                  <span className="material-symbols-outlined text-[18px] text-primary"
                    style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-primary">Usar sugestão da IA</p>
                    <p className="truncate text-[11px] text-on-surface-variant/60">
                      {email.metadados.sugestao?.slice(0, 100)}…
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-primary/60 shrink-0">arrow_forward</span>
                </button>
              )}

              <button
                onClick={() => setRespondendo(true)}
                className="flex w-full items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-[13px] text-on-surface-variant/50 hover:border-primary/30 hover:text-on-surface transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">reply</span>
                Clique para responder…
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-6 py-4">
              {usouSugestao && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-1.5">
                  <span className="material-symbols-outlined text-[13px] text-primary"
                    style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                  <span className="text-[11px] text-primary font-medium">Sugestão da IA aplicada</span>
                  <button
                    onClick={() => { setResposta(''); setUsouSugestao(false) }}
                    className="ml-auto text-[11px] text-on-surface-variant/50 hover:text-on-surface transition-colors"
                  >limpar</button>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  value={paraResp}
                  onChange={e => setParaResp(e.target.value)}
                  className="flex-1 rounded-xl border border-outline-variant/50 bg-surface px-3 py-2 text-[12px] text-on-surface focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
                  placeholder="Para"
                />
                <input
                  value={assuntoResp}
                  onChange={e => setAssuntoResp(e.target.value)}
                  className="flex-1 rounded-xl border border-outline-variant/50 bg-surface px-3 py-2 text-[12px] text-on-surface focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
                  placeholder="Assunto"
                />
              </div>

              <textarea
                value={resposta}
                onChange={e => setResposta(e.target.value)}
                rows={6}
                placeholder="Escreva sua resposta..."
                autoFocus
                className="w-full resize-none rounded-xl border border-outline-variant/50 bg-surface px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
              />

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRespondendo(false)}
                  className="rounded-xl border border-outline-variant/25 px-4 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={enviarResposta}
                  disabled={enviando || !paraResp.trim() || !assuntoResp.trim() || !resposta.trim()}
                  className="ml-auto flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  {enviando
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    : <span className="material-symbols-outlined text-[15px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}>send</span>}
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

// ─── Painel: compor novo e-mail ───────────────────────────────────────────────

function PainelCompor({ clientes, onSent, onClose }: {
  clientes: ClienteOpt[]
  onSent: (e: EmailItem) => void
  onClose: () => void
}) {
  const [para, setPara]       = useState('')
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo]     = useState('')
  const [clienteId, setClienteId] = useState('')
  const [enviando, setEnviando]   = useState(false)
  const [mostrarClientes, setMostrarClientes] = useState(false)

  // Autocomplete de clientes
  const clientesFiltrados = useMemo(() => {
    if (!mostrarClientes) return []
    const q = para.toLowerCase()
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false)
    ).slice(0, 8)
  }, [para, clientes, mostrarClientes])

  function selecionarCliente(c: ClienteOpt) {
    setPara(c.email ?? '')
    setClienteId(c.id)
    setMostrarClientes(false)
  }

  async function enviar() {
    if (!para.trim() || !assunto.trim() || !corpo.trim()) return
    setEnviando(true)
    try {
      const res = await fetch('/api/email/enviar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          para:      para.trim(),
          assunto:   assunto.trim(),
          corpo:     corpo.trim(),
          clienteId: clienteId || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'Erro ao enviar e-mail')
        return
      }
      onSent({
        id:           crypto.randomUUID(),
        tipo:         'email_enviado',
        titulo:       assunto,
        conteudo:     corpo,
        criadoEm:     new Date().toISOString(),
        respondidoEm: null,
        clienteId:    clienteId || null,
        leadId:       null,
        clienteNome:  clientes.find(c => c.id === clienteId)?.nome ?? null,
        clienteLink:  clienteId ? `/crm/clientes/${clienteId}` : null,
        metadados: {
          de: '',
          para: para.trim(),
          nomeRemetente: null,
          assunto: assunto.trim(),
          messageId: null,
          dataEnvio: new Date().toISOString(),
          anexos: [],
          sugestao: null,
        },
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-outline-variant/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <span className="material-symbols-outlined text-[16px] text-primary">edit</span>
          </div>
          <span className="text-[15px] font-semibold text-on-surface">Novo e-mail</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Formulário */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* Campo Para com autocomplete */}
        <div className="relative">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Para
          </label>
          <input
            value={para}
            onChange={e => { setPara(e.target.value); setClienteId(''); setMostrarClientes(true) }}
            onFocus={() => setMostrarClientes(true)}
            onBlur={() => setTimeout(() => setMostrarClientes(false), 150)}
            placeholder="email@exemplo.com.br"
            type="email"
            className="w-full rounded-xl border border-outline-variant/50 bg-surface px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
          />

          {/* Dropdown de clientes */}
          {mostrarClientes && clientesFiltrados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-outline-variant/20 bg-card shadow-lg overflow-hidden">
              {clientesFiltrados.map(c => (
                <button
                  key={c.id}
                  onMouseDown={() => selecionarCliente(c)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-container-low transition-colors"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-[11px] font-bold text-primary">
                      {c.nome.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-on-surface truncate">{c.nome}</p>
                    <p className="text-[11px] text-on-surface-variant/60 truncate">{c.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Assunto
          </label>
          <input
            value={assunto}
            onChange={e => setAssunto(e.target.value)}
            placeholder="Assunto do e-mail"
            className="w-full rounded-xl border border-outline-variant/50 bg-surface px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Mensagem
          </label>
          <textarea
            value={corpo}
            onChange={e => setCorpo(e.target.value)}
            rows={14}
            placeholder="Escreva sua mensagem..."
            className="w-full resize-none rounded-xl border border-outline-variant/50 bg-surface px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-outline-variant/10 px-6 py-4">
        <button
          onClick={onClose}
          className="rounded-xl border border-outline-variant/25 px-4 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={enviar}
          disabled={enviando || !para.trim() || !assunto.trim() || !corpo.trim()}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition-all"
        >
          {enviando
            ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            : <span className="material-symbols-outlined text-[15px]"
                style={{ fontVariationSettings: "'FILL' 1" }}>send</span>}
          Enviar
        </button>
      </div>
    </div>
  )
}
