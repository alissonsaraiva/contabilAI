'use client'

import { useState }                      from 'react'
import type { ThreadItem, MensagemThread } from './_shared'

export function MensagemBubble({ msg, thread, arquivandoAnexos, anexosArquivados, onArquivarAnexo }: {
  msg:              MensagemThread
  thread:           ThreadItem
  arquivandoAnexos: Set<string>
  anexosArquivados: Set<string>
  onArquivarAnexo:  (msgId: string, nome: string, url: string, mimeType: string) => void
}) {
  const [expandido, setExpandido] = useState(true)
  const isEnviado = msg.tipo === 'email_enviado'
  const dataFormatada = new Date(msg.criadoEm)
    .toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  const remetente = isEnviado
    ? (msg.nomeRemetente ?? 'Você')
    : (msg.nomeRemetente ?? msg.de)

  return (
    <div className={`rounded-xl border transition-all ${
      isEnviado
        ? 'border-primary/15 bg-primary/4'
        : 'border-outline-variant/15 bg-surface-container-low/50'
    }`}>
      {/* Cabeçalho da mensagem */}
      <button
        onClick={() => setExpandido(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          isEnviado ? 'bg-primary/15 text-primary' : 'bg-surface-container text-on-surface-variant'
        }`}>
          {remetente.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-semibold text-on-surface">{remetente}</span>
          {!expandido && (
            <span className="ml-2 text-[11px] text-on-surface-variant/50 truncate">{msg.conteudo?.slice(0, 60)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isEnviado && <span className="material-symbols-outlined text-[12px] text-primary/60">reply</span>}
          <span className="text-[10px] text-on-surface-variant/40">{dataFormatada}</span>
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant/40">
            {expandido ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </button>

      {/* Corpo */}
      {expandido && (
        <div className="px-4 pb-4">
          {/* Metadados de/para */}
          <div className="mb-3 text-[11px] text-on-surface-variant/50">
            {isEnviado ? (
              <span>Para: <span className="font-medium text-on-surface/70">{msg.para}</span></span>
            ) : (
              <span>De: <span className="font-medium text-on-surface/70">{msg.nomeRemetente ? `${msg.nomeRemetente} <${msg.de}>` : msg.de}</span></span>
            )}
          </div>

          {/* Corpo do email */}
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-on-surface/80">
            {msg.conteudo}
          </p>

          {/* Anexos */}
          {msg.anexos.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {msg.anexos.map((a, i) => {
                const key = `${msg.id}::${a.nome}`
                const rejeitado = msg.anexosRejeitados.includes(a.nome) && !anexosArquivados.has(key)
                const arquivado = anexosArquivados.has(key)
                const arquivando = arquivandoAnexos.has(key)
                const temVinculo = !!(thread.clienteId || thread.leadId)

                const downloadUrl = `/api/email/anexo/download?url=${encodeURIComponent(a.url)}`

                if (!rejeitado) {
                  return (
                    <a key={i} href={downloadUrl} target="_blank" rel="noopener noreferrer"
                      className={`self-start flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        arquivado
                          ? 'border-green-500/30 bg-green-500/8 text-green-700 dark:text-green-400'
                          : 'border-outline-variant/20 bg-surface-container text-on-surface-variant/70 hover:text-on-surface'
                      }`}>
                      <span className="material-symbols-outlined text-[13px]">{arquivado ? 'check_circle' : 'attach_file'}</span>
                      {a.nome}
                      {arquivado && <span className="text-[10px] text-green-600/70">Arquivado</span>}
                    </a>
                  )
                }

                // Card para anexo rejeitado pelo classificador
                return (
                  <div key={i} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-amber-500 mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-on-surface/90 truncate">{a.nome}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-amber-700/70">
                          {temVinculo ? 'A IA não arquivou automaticamente — verifique se é um documento relevante' : 'A IA não arquivou automaticamente — vincule a um cliente para poder arquivar'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-outline-variant/25 py-2.5 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors min-h-[42px]">
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>Abrir
                      </a>
                      {temVinculo ? (
                        <button onClick={() => onArquivarAnexo(msg.id, a.nome, a.url, a.mimeType)} disabled={arquivando} className="flex flex-[2] items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/8 py-2.5 text-[12px] font-semibold text-primary hover:bg-primary/15 transition-colors disabled:opacity-60 min-h-[42px]">
                          {arquivando ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" /> : <span className="material-symbols-outlined text-[14px]">drive_folder_upload</span>}
                          {arquivando ? 'Arquivando…' : 'Arquivar na ficha'}
                        </button>
                      ) : (
                        <div className="flex flex-[2] items-center justify-center gap-1.5 rounded-lg border border-outline-variant/15 py-2.5 text-[12px] font-medium text-on-surface-variant/40 min-h-[42px] cursor-not-allowed">
                          <span className="material-symbols-outlined text-[14px]">drive_folder_upload</span>Arquivar na ficha
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
