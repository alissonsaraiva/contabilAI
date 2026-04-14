'use client'

import type { ThreadItem } from './_shared'
import type { Aba }        from './_shared'

/** Remove tags HTML e normaliza espaços — para exibir preview de emails com corpo HTML */
function stripHtml(texto: string): string {
  return texto
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function ThreadRow({ thread, aba, selecionado, marcado, onToggle, onClick }: {
  thread:      ThreadItem
  aba:         Aba
  selecionado: boolean
  marcado:     boolean
  onToggle:    (e: React.MouseEvent) => void
  onClick:     () => void
}) {
  const naoLido   = aba === 'entrada' && thread.temNaoRespondido
  const ultimaMsg = thread.mensagens[thread.mensagens.length - 1]!
  const contagem  = thread.mensagens.length
  const dataFormatada = new Date(thread.ultimaData)
    .toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  // Badge de urgência: thread de entrada sem resposta há mais de 48h
  // eslint-disable-next-line react-hooks/purity -- Date.now() intencional: badge de urgência, imprecisão de segundos é irrelevante para o threshold de 48h
  const horasSemResposta = naoLido ? (Date.now() - new Date(thread.ultimaData).getTime()) / 36e5 : 0
  const urgente = horasSemResposta >= 48

  // Remetente mais recente
  const ultimo = thread.mensagens[thread.mensagens.length - 1]!
  const remetenteUltimo = ultimo.tipo === 'email_enviado'
    ? 'Você'
    : (ultimo.nomeRemetente ?? ultimo.de)

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
        <span onClick={onToggle} className={`shrink-0 transition-opacity ${marcado ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} style={{ lineHeight: 0 }}>
          <input type="checkbox" checked={marcado} onChange={() => {}} className="h-3.5 w-3.5 accent-primary cursor-pointer" />
        </span>
        {naoLido && !marcado && <div className="h-2 w-2 shrink-0 rounded-full bg-primary group-hover:hidden" />}
        <span className={`flex-1 truncate text-[12px] ${naoLido ? 'font-bold text-on-surface' : 'font-medium text-on-surface/80'}`}>
          {thread.clienteNome ?? remetenteUltimo}
        </span>
        {contagem > 1 && (
          <span className="shrink-0 rounded-full bg-surface-container px-1.5 text-[9px] font-semibold text-on-surface-variant/60">{contagem}</span>
        )}
        <span className="shrink-0 text-[10px] text-on-surface-variant/40">{dataFormatada}</span>
      </div>
      <p className={`truncate text-[11px] ${naoLido ? 'font-semibold text-on-surface/90' : 'text-on-surface-variant/70'}`}>
        {thread.assunto}
      </p>
      <p className="truncate text-[11px] text-on-surface-variant/50">
        {ultimo.tipo === 'email_enviado' ? '↩ Você: ' : ''}{ultimaMsg.conteudo ? stripHtml(ultimaMsg.conteudo).slice(0, 70) : ''}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
        {thread.clienteNome && aba !== 'enviados' && (
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[9px] text-on-surface-variant/50">{thread.clienteNome}</span>
        )}
        {aba === 'entrada' && !thread.clienteNome && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-500/80">Sem vínculo</span>
        )}
        {urgente && (
          <span className="flex items-center gap-0.5 rounded-full bg-error/10 px-2 py-0.5 text-[9px] font-semibold text-error">
            <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>schedule</span>
            {Math.floor(horasSemResposta) < 72
              ? `${Math.floor(horasSemResposta)}h sem resposta`
              : `${Math.floor(horasSemResposta / 24)}d sem resposta`}
          </span>
        )}
        {aba === 'tratados' && (
          thread.mensagens.some(m => m.tipo === 'email_enviado')
            ? <span className="flex items-center gap-0.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[9px] font-medium text-green-600/80"><span className="material-symbols-outlined text-[10px]">reply</span>Respondido</span>
            : <span className="flex items-center gap-0.5 rounded-full bg-surface-container px-2 py-0.5 text-[9px] text-on-surface-variant/40"><span className="material-symbols-outlined text-[10px]">check_circle</span>Dispensado</span>
        )}
        {/* Operador atribuído */}
        {aba === 'entrada' && thread.atribuidaPara && (
          <span className="flex items-center gap-0.5 rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-semibold text-violet-600">
            <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>person_pin</span>
            {thread.atribuidaPara.nome.split(' ')[0]}
          </span>
        )}
      </div>
    </button>
  )
}
