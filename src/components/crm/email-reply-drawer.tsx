'use client'

import { useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { toast } from 'sonner'
import type { EmailInboxItem } from '@/app/api/email/inbox/route'

type Props = {
  email: EmailInboxItem | null
  open: boolean
  onClose: () => void
  onReplied: (id: string) => void
  onDispensed: (id: string) => void
}

export function EmailReplyDrawer({ email, open, onClose, onReplied, onDispensed }: Props) {
  const [para,    setPara]    = useState('')
  const [assunto, setAssunto] = useState('')
  const [corpo,   setCorpo]   = useState('')
  const [enviando,    setEnviando]    = useState(false)
  const [dispensando, setDispensando] = useState(false)
  const [usandoSugestao, setUsandoSugestao] = useState(false)

  // Sync fields when email changes
  const prevEmailId = email?.id
  if (email && email.id !== prevEmailId) {
    setPara(email.metadados.de)
    setAssunto(`Re: ${email.metadados.assunto}`)
    setCorpo('')
    setUsandoSugestao(false)
  }

  function aplicarSugestao() {
    if (!email?.metadados.sugestao) return
    setCorpo(email.metadados.sugestao)
    setUsandoSugestao(true)
  }

  async function enviar() {
    if (!email || !para.trim() || !assunto.trim() || !corpo.trim()) return
    setEnviando(true)
    try {
      const res = await fetch('/api/email/enviar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          para,
          assunto,
          corpo,
          clienteId:         email.clienteId ?? undefined,
          leadId:            email.leadId    ?? undefined,
          interacaoOrigemId: email.id,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Não foi possível enviar o e-mail. Tente novamente.')
        return
      }
      toast.success('E-mail enviado.')
      onReplied(email.id)
      onClose()
    } finally {
      setEnviando(false)
    }
  }

  async function dispensar() {
    if (!email) return
    setDispensando(true)
    try {
      const res = await fetch(`/api/email/inbox/${email.id}/dispensar`, { method: 'PATCH' })
      if (!res.ok) { toast.error('Não foi possível dispensar o e-mail. Tente novamente.'); return }
      toast.success('E-mail marcado como tratado.')
      onDispensed(email.id)
      onClose()
    } finally {
      setDispensando(false)
    }
  }

  // Inicializa campos ao abrir
  function handleOpenChange(v: boolean) {
    if (v && email) {
      setPara(email.metadados.de)
      setAssunto(`Re: ${email.metadados.assunto}`)
      setCorpo('')
      setUsandoSugestao(false)
    }
    if (!v) onClose()
  }

  const temSugestao = !!email?.metadados.sugestao

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col gap-0 p-0" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}>reply</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-on-surface">Responder e-mail</p>
            <p className="truncate text-[11px] text-on-surface-variant/60">
              {email?.metadados.nomeRemetente
                ? `${email.metadados.nomeRemetente} <${email.metadados.de}>`
                : email?.metadados.de}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Email original */}
        {email && (
          <div className="mx-5 mt-4 rounded-xl border border-outline-variant/15 bg-surface-container-low/60 p-3.5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant/40">mail</span>
              <span className="text-[11px] font-semibold text-on-surface-variant/60 uppercase tracking-wider">
                E-mail recebido
              </span>
              <span className="ml-auto text-[10px] text-on-surface-variant/40">
                {email.metadados.dataEnvio
                  ? new Date(email.metadados.dataEnvio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                  : new Date(email.criadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </div>
            <p className="text-[12px] font-semibold text-on-surface line-clamp-1">{email.metadados.assunto}</p>
            <p className="mt-1 text-[11px] text-on-surface-variant/70 line-clamp-3 leading-relaxed whitespace-pre-wrap">
              {email.conteudo}
            </p>
            {email.metadados.anexos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {email.metadados.anexos.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-full border border-outline-variant/20 bg-surface-container px-2.5 py-1 text-[10px] text-on-surface-variant/70 hover:text-on-surface transition-colors"
                  >
                    <span className="material-symbols-outlined text-[12px]">attach_file</span>
                    {a.nome}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sugestão da IA */}
        {temSugestao && !usandoSugestao && (
          <div className="mx-5 mt-3">
            <button
              onClick={aplicarSugestao}
              className="flex w-full items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10"
            >
              <span className="material-symbols-outlined text-[18px] text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-primary">Usar sugestão da IA</p>
                <p className="truncate text-[11px] text-on-surface-variant/60">
                  {email?.metadados.sugestao?.slice(0, 80)}…
                </p>
              </div>
              <span className="material-symbols-outlined text-[16px] text-primary/60 shrink-0">
                arrow_forward
              </span>
            </button>
          </div>
        )}

        {usandoSugestao && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg bg-primary/8 px-3 py-2">
            <span className="material-symbols-outlined text-[14px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            <span className="text-[11px] text-primary font-medium">Sugestão da IA aplicada — edite à vontade</span>
            <button
              onClick={() => { setCorpo(''); setUsandoSugestao(false) }}
              className="ml-auto text-[11px] text-on-surface-variant/50 hover:text-on-surface transition-colors"
            >
              limpar
            </button>
          </div>
        )}

        {/* Formulário */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Para */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Para
            </label>
            <input
              value={para}
              onChange={e => setPara(e.target.value)}
              className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>

          {/* Assunto */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Assunto
            </label>
            <input
              value={assunto}
              onChange={e => setAssunto(e.target.value)}
              className="w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>

          {/* Corpo */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
              Mensagem
            </label>
            <textarea
              value={corpo}
              onChange={e => setCorpo(e.target.value)}
              rows={10}
              placeholder="Digite sua resposta..."
              className="w-full resize-none rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2.5 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-outline-variant/15 px-5 py-4">
          <button
            onClick={dispensar}
            disabled={dispensando || enviando}
            className="flex items-center gap-1.5 rounded-xl border border-outline-variant/25 px-4 py-2.5 text-[12px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            {dispensando
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/20 border-t-on-surface-variant/60" />
              : <span className="material-symbols-outlined text-[16px]">check_circle</span>}
            Marcar como tratado
          </button>
          <button
            onClick={enviar}
            disabled={enviando || dispensando || !para.trim() || !assunto.trim() || !corpo.trim()}
            className="ml-auto flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {enviando
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>}
            Enviar resposta
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
