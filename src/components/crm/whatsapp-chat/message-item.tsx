'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Mensagem } from './use-whatsapp-chat'
import { humanizarErroWhatsApp } from '@/lib/whatsapp/humanizar-erro'

type Props = {
  m: Mensagem
  excluindo: Set<string>
  onExcluir: (id: string) => void
}

/** Iniciais de até 2 palavras do nome */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  const a = partes[0]?.charAt(0).toUpperCase() ?? ''
  const b = partes[1]?.charAt(0).toUpperCase() ?? ''
  return a + b
}

export function MessageItem({ m, excluindo, onExcluir }: Props) {
  const isExcluindo = excluindo.has(m.id)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // FIX #12: status 'pending' agora tem estilo visual distinto
  const bubbleClass = m.excluido
    ? 'rounded-br-md bg-surface-container/60 text-on-surface-variant/50 ring-1 ring-outline-variant/20'
    : m.role === 'user'
      ? 'rounded-bl-md bg-surface-container text-on-surface'
      : m.status === 'failed'
        ? 'rounded-br-md bg-error/10 text-on-surface ring-1 ring-error/20'
        : m.status === 'pending'
          ? 'rounded-br-md bg-primary/30 text-on-surface ring-1 ring-primary/20'
          : 'rounded-br-md bg-primary text-white'

  return (
    <>
    <ConfirmDialog
      open={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      onConfirm={() => { setConfirmOpen(false); onExcluir(m.id) }}
      title="Apagar mensagem para todos?"
      description="A mensagem será removida para você e para o contato no WhatsApp. Esta ação não pode ser desfeita."
      confirmLabel="Apagar"
    />
    <div className={`group flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
      {m.role === 'user' && (
        <div className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15">
          <span className="material-symbols-outlined text-[12px] text-[#25D366]">person</span>
        </div>
      )}

      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed ${bubbleClass}`}>
        {m.excluido ? (
          <p className="flex items-center gap-1.5 italic">
            <span className="material-symbols-outlined text-[13px]">block</span>
            Mensagem excluída
          </p>
        ) : m.conteudo === '[áudio]' ? (
          <div className="flex flex-col gap-1">
            <audio controls src={`/api/whatsapp/media/${m.id}`} className="h-8 w-full max-w-[11rem] rounded-md" />
            <p className="text-[10px] text-on-surface-variant/50">Áudio não transcrito</p>
          </div>
        ) : m.hasWhatsappMedia && m.conteudo === '[image]' ? (
          <div className="flex flex-col gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/whatsapp/media/${m.id}`} alt="imagem" className="max-w-full rounded-xl object-cover" />
          </div>
        ) : m.hasWhatsappMedia ? (
          <div className="flex flex-col gap-1.5">
            <a
              href={`/api/whatsapp/media/${m.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 hover:bg-white/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">attach_file</span>
              <span className="text-[12px] truncate max-w-[8rem] sm:max-w-[12rem]">
                {m.conteudo?.startsWith('[') ? 'Arquivo do cliente' : m.conteudo}
              </span>
              <span className="material-symbols-outlined text-[14px] shrink-0 opacity-60">download</span>
            </a>
          </div>
        ) : m.mediaUrl && m.mediaType === 'image' ? (
          <div className="flex flex-col gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.mediaUrl} alt={m.mediaFileName ?? 'imagem'} className="max-w-full rounded-xl object-cover" />
            {m.conteudo && <p className="whitespace-pre-wrap text-[12px]">{m.conteudo}</p>}
          </div>
        ) : m.mediaUrl ? (
          <div className="flex flex-col gap-1.5">
            <a
              href={m.mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 hover:bg-white/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px] shrink-0">attach_file</span>
              <span className="text-[12px] truncate max-w-[8rem] sm:max-w-[12rem]">{m.mediaFileName ?? 'Arquivo'}</span>
              <span className="material-symbols-outlined text-[14px] shrink-0 opacity-60">download</span>
            </a>
            {m.conteudo && <p className="whitespace-pre-wrap text-[12px]">{m.conteudo}</p>}
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{m.conteudo}</p>
        )}

        {!m.excluido && (
          <div className={`mt-1 flex items-baseline gap-1.5 text-[10px] ${
            m.role === 'user'
              ? 'text-on-surface-variant/50'
              : m.status === 'failed'
                ? 'text-error/60'
                : m.status === 'pending'
                  ? 'text-on-surface/50'
                  : 'text-white/50'
          }`}>
            <span>{new Date(m.criadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            {/* Nome do operador humano — distingue de mensagens da IA */}
            {m.role === 'assistant' && m.operadorNome && (
              <span className="font-semibold opacity-80">{m.operadorNome}</span>
            )}
          </div>
        )}

        {/* FIX #12: indicador visual de mensagem em trânsito */}
        {m.role === 'assistant' && m.status === 'pending' && !m.excluido && (
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-on-surface/60">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Enviando...
          </p>
        )}

        {m.role === 'assistant' && m.status === 'failed' && !m.excluido && (
          <p
            className="mt-0.5 flex items-center gap-1 text-[10px] text-error/70"
            title={humanizarErroWhatsApp(m.erroEnvio)}
          >
            <span className="material-symbols-outlined text-[10px]">error</span>
            Não entregue
          </p>
        )}
      </div>

      {m.role === 'assistant' && !m.excluido && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isExcluindo}
          aria-label="Apagar mensagem para todos"
          className="ml-1 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-on-surface-variant/0 transition-all hover:bg-error/10 hover:text-error group-hover:text-on-surface-variant/40 disabled:opacity-40"
          title="Apagar para todos"
        >
          {isExcluindo
            ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-on-surface-variant" />
            : <span className="material-symbols-outlined text-[14px]">delete</span>
          }
        </button>
      )}

      {m.role === 'assistant' && (
        m.operadorNome ? (
          // Mensagem enviada por operador humano — avatar com iniciais
          <div
            className="ml-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-status/15"
            title={m.operadorNome}
          >
            <span className="text-[9px] font-bold text-orange-status leading-none">
              {iniciais(m.operadorNome)}
            </span>
          </div>
        ) : (
          // Mensagem gerada pela IA
          <div className="ml-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <span
              className="material-symbols-outlined text-[12px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              smart_toy
            </span>
          </div>
        )
      )}
    </div>
    </>
  )
}
