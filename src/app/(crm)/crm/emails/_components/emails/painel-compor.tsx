'use client'

import { useState, useMemo } from 'react'
import { toast }             from 'sonner'
import type { ThreadItem, MensagemThread, ClienteOpt } from './_shared'

export function PainelCompor({ clientes, onSent, onClose }: {
  clientes: ClienteOpt[]
  onSent:   (t: ThreadItem) => void
  onClose:  () => void
}) {
  const [para,    setPara]    = useState('')
  const [assunto, setAssunto] = useState('')
  const [corpo,   setCorpo]   = useState('')
  const [clienteId, setClienteId] = useState('')
  const [enviando,  setEnviando]  = useState(false)
  const [mostrarClientes, setMostrarClientes] = useState(false)

  const clientesFiltrados = useMemo(() => {
    if (!mostrarClientes) return []
    const q = para.toLowerCase()
    return clientes.filter(c => c.nome.toLowerCase().includes(q) || (c.email?.toLowerCase().includes(q) ?? false)).slice(0, 8)
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ para: para.trim(), assunto: assunto.trim(), corpo: corpo.trim(), clienteId: clienteId || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'Erro ao enviar e-mail')
        return
      }
      const agora = new Date().toISOString()
      const msgId = crypto.randomUUID()
      const novaMensagem: MensagemThread = {
        id:               msgId,
        tipo:             'email_enviado',
        conteudo:         corpo.trim(),
        criadoEm:         agora,
        respondidoEm:     null,
        de:               '',
        para:             para.trim(),
        nomeRemetente:    null,
        assunto:          assunto.trim(),
        messageId:        null,
        anexos:           [],
        anexosRejeitados: [],
        sugestao:         null,
        origem:           'usuario',
      }
      onSent({
        threadId:         msgId,
        assunto:          assunto.trim(),
        clienteId:        clienteId || null,
        leadId:           null,
        clienteNome:      clientes.find(c => c.id === clienteId)?.nome ?? null,
        clienteLink:      clienteId ? `/crm/clientes/${clienteId}` : null,
        temNaoRespondido: false,
        ultimaData:       agora,
        mensagens:        [novaMensagem],
        atribuidaPara:    null,
        interacaoRaizId:  msgId,
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-outline-variant/10 px-4 md:px-6 py-4">
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={onClose} className="md:hidden flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <span className="material-symbols-outlined text-[16px] text-primary">edit</span>
          </div>
          <span className="text-[15px] font-semibold text-on-surface">Novo e-mail</span>
        </div>
        <button onClick={onClose} className="hidden md:flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors">
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5 space-y-4">
        <div className="relative">
          <input
            value={para} onChange={e => { setPara(e.target.value); setClienteId(''); setMostrarClientes(true) }}
            onFocus={() => setMostrarClientes(true)} onBlur={() => setTimeout(() => setMostrarClientes(false), 150)}
            placeholder="Para (e-mail ou nome do cliente)"
            className="w-full rounded-xl border border-outline-variant/50 bg-surface px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all"
          />
          {mostrarClientes && clientesFiltrados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-outline-variant/20 bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto">
              {clientesFiltrados.map(c => (
                <button key={c.id} onMouseDown={() => selecionarCliente(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[12px] transition-colors hover:bg-surface-container-low">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-[11px] font-bold text-primary">{c.nome.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-on-surface">{c.nome}</p>
                    {c.email && <p className="truncate text-[10px] text-on-surface-variant/60">{c.email}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <input value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Assunto" className="w-full rounded-xl border border-outline-variant/50 bg-surface px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all" />
        <textarea value={corpo} onChange={e => setCorpo(e.target.value)} rows={10} placeholder="Corpo do e-mail..." className="w-full resize-none rounded-xl border border-outline-variant/50 bg-surface px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 transition-all" />
      </div>
      <div className="border-t border-outline-variant/10 px-4 md:px-6 py-4 flex items-center justify-between gap-3">
        <button onClick={onClose} className="rounded-xl border border-outline-variant/25 px-4 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">Cancelar</button>
        <button onClick={enviar} disabled={enviando || !para.trim() || !assunto.trim() || !corpo.trim()} className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition-all">
          {enviando ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>}
          Enviar
        </button>
      </div>
    </div>
  )
}
