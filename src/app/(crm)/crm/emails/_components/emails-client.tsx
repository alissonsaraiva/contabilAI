'use client'

import { useState } from 'react'
import Link from 'next/link'
import { EmailReplyDrawer } from '@/components/crm/email-reply-drawer'
import type { EmailInboxItem } from '@/app/api/email/inbox/route'

type SerializedEmail = {
  id: string
  titulo: string | null
  conteudo: string | null
  criadoEm: string
  respondidoEm: string | null
  clienteId: string | null
  leadId: string | null
  clienteNome: string | null
  clienteLink: string | null
  metadados: EmailInboxItem['metadados']
}

type Props = {
  pendentes:  SerializedEmail[]
  resolvidos: SerializedEmail[]
}

export function EmailsClient({ pendentes: initialPendentes, resolvidos: initialResolvidos }: Props) {
  const [pendentes,  setPendentes]  = useState(initialPendentes)
  const [resolvidos, setResolvidos] = useState(initialResolvidos)
  const [emailAberto, setEmailAberto] = useState<SerializedEmail | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState<'pendentes' | 'resolvidos'>('pendentes')

  function abrirEmail(email: SerializedEmail) {
    setEmailAberto(email)
    setDrawerAberto(true)
  }

  function onReplied(id: string) {
    const email = pendentes.find(e => e.id === id)
    if (email) {
      setPendentes(prev => prev.filter(e => e.id !== id))
      setResolvidos(prev => [{ ...email, respondidoEm: new Date().toISOString() }, ...prev])
    }
  }

  function onDispensed(id: string) {
    const email = pendentes.find(e => e.id === id)
    if (email) {
      setPendentes(prev => prev.filter(e => e.id !== id))
      setResolvidos(prev => [{ ...email, respondidoEm: new Date().toISOString() }, ...prev])
    }
  }

  const lista = abaAtiva === 'pendentes' ? pendentes : resolvidos

  return (
    <>
      {/* Abas */}
      <div className="flex gap-1 rounded-[12px] border border-outline-variant/15 bg-surface-container-low p-1 w-fit">
        <button
          onClick={() => setAbaAtiva('pendentes')}
          className={`flex items-center gap-2 rounded-[9px] px-4 py-2 text-[13px] font-semibold transition-all ${
            abaAtiva === 'pendentes'
              ? 'bg-card text-on-surface shadow-sm'
              : 'text-on-surface-variant/60 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            mark_email_unread
          </span>
          Não respondidos
          {pendentes.length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              abaAtiva === 'pendentes' ? 'bg-primary/15 text-primary' : 'bg-surface-container text-on-surface-variant/60'
            }`}>
              {pendentes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setAbaAtiva('resolvidos')}
          className={`flex items-center gap-2 rounded-[9px] px-4 py-2 text-[13px] font-semibold transition-all ${
            abaAtiva === 'resolvidos'
              ? 'bg-card text-on-surface shadow-sm'
              : 'text-on-surface-variant/60 hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            mark_email_read
          </span>
          Respondidos
        </button>
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[16px] border border-outline-variant/15 bg-card py-20 text-center">
          <span className="material-symbols-outlined mb-4 text-[48px] text-on-surface-variant/20"
            style={{ fontVariationSettings: "'FILL' 1" }}>
            {abaAtiva === 'pendentes' ? 'mark_email_read' : 'inbox'}
          </span>
          <p className="text-[14px] font-medium text-on-surface-variant/50">
            {abaAtiva === 'pendentes' ? 'Nenhum e-mail pendente' : 'Nenhum e-mail respondido recentemente'}
          </p>
          {abaAtiva === 'pendentes' && (
            <p className="mt-1 text-[12px] text-on-surface-variant/30">
              Novos e-mails aparecerão aqui assim que chegarem
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/10 rounded-[16px] border border-outline-variant/15 bg-card overflow-hidden">
          {lista.map(email => (
            <EmailRow
              key={email.id}
              email={email}
              respondido={abaAtiva === 'resolvidos'}
              onAbrir={() => abrirEmail(email)}
              onDispensar={async () => {
                const res = await fetch(`/api/email/inbox/${email.id}/dispensar`, { method: 'PATCH' })
                if (res.ok) onDispensed(email.id)
              }}
            />
          ))}
        </div>
      )}

      {/* Drawer de resposta */}
      <EmailReplyDrawer
        email={emailAberto}
        open={drawerAberto}
        onClose={() => setDrawerAberto(false)}
        onReplied={onReplied}
        onDispensed={onDispensed}
      />
    </>
  )
}

// ─── Row de email ─────────────────────────────────────────────────────────────

function EmailRow({
  email,
  respondido,
  onAbrir,
  onDispensar,
}: {
  email: SerializedEmail
  respondido: boolean
  onAbrir: () => void
  onDispensar: () => void
}) {
  const remetente = email.metadados.nomeRemetente ?? email.metadados.de
  const dataFormatada = new Date(email.metadados.dataEnvio ?? email.criadoEm)
    .toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const temSugestao = !!email.metadados.sugestao
  const temAnexos   = email.metadados.anexos.length > 0

  return (
    <div className={`group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-surface-container-low/60 ${
      respondido ? 'opacity-60' : ''
    }`}>
      {/* Ícone de status */}
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
        respondido ? 'bg-green-status/10' : 'bg-primary/10'
      }`}>
        <span className={`material-symbols-outlined text-[18px] ${respondido ? 'text-green-status' : 'text-primary'}`}
          style={{ fontVariationSettings: "'FILL' 1" }}>
          {respondido ? 'mark_email_read' : 'mail'}
        </span>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-on-surface">{remetente}</span>
          {email.clienteNome && (
            <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-[10px] text-on-surface-variant/60">
              {email.clienteNome}
            </span>
          )}
          {!email.clienteId && !email.leadId && (
            <span className="shrink-0 rounded-full bg-orange-status/10 px-2 py-0.5 text-[10px] font-medium text-orange-status">
              desconhecido
            </span>
          )}
          <span className="ml-auto shrink-0 text-[11px] text-on-surface-variant/40">{dataFormatada}</span>
        </div>

        <p className="mt-0.5 text-[13px] font-medium text-on-surface/80 truncate">
          {email.metadados.assunto}
        </p>

        <p className="mt-0.5 text-[12px] text-on-surface-variant/60 line-clamp-1">
          {email.conteudo}
        </p>

        {/* Badges */}
        <div className="mt-2 flex items-center gap-2">
          {temSugestao && !respondido && (
            <span className="flex items-center gap-1 rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-semibold text-primary">
              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_awesome
              </span>
              Sugestão da IA disponível
            </span>
          )}
          {temAnexos && (
            <span className="flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[10px] text-on-surface-variant/60">
              <span className="material-symbols-outlined text-[12px]">attach_file</span>
              {email.metadados.anexos.length} anexo{email.metadados.anexos.length > 1 ? 's' : ''}
            </span>
          )}
          {email.clienteLink && (
            <Link
              href={email.clienteLink}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[10px] text-on-surface-variant/60 hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[12px]">person</span>
              Ver cliente
            </Link>
          )}
          {respondido && email.respondidoEm && (
            <span className="text-[10px] text-on-surface-variant/40">
              Tratado em {new Date(email.respondidoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
        </div>
      </div>

      {/* Ações — visíveis no hover */}
      {!respondido && (
        <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onDispensar}
            title="Marcar como tratado"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 text-on-surface-variant/50 transition-colors hover:bg-surface-container hover:text-green-status"
          >
            <span className="material-symbols-outlined text-[16px]">check</span>
          </button>
          <button
            onClick={onAbrir}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              reply
            </span>
            Responder
          </button>
        </div>
      )}
    </div>
  )
}
