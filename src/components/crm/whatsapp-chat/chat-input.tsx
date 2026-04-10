'use client'

import type { RefObject, ChangeEvent } from 'react'
import type { ArquivoAnexo } from './use-whatsapp-chat'

type Props = {
  arquivos: ArquivoAnexo[]
  uploading: boolean
  texto: string
  setTexto: (v: string) => void
  sending: boolean
  pausada: boolean
  naoModoIA: boolean
  setNaoModoIA: (fn: (v: boolean) => boolean) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
  onRemoverArquivo: (index: number) => void
  onEnviar: () => void
  onPickerOpen: () => void
}

export function ChatInput({
  arquivos, uploading, texto, setTexto, sending, pausada,
  naoModoIA, setNaoModoIA, fileInputRef,
  onFileChange, onRemoverArquivo, onEnviar, onPickerOpen,
}: Props) {
  return (
    <div className="shrink-0 border-t border-outline-variant/15 px-4 py-3">
      {arquivos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {arquivos.map((arq, i) => (
            <div key={`${arq.url}-${arq.name}`} className="flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-2.5 py-1.5 max-w-[200px]">
              {arq.type === 'image' && arq.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={arq.previewUrl} alt="preview" className="h-7 w-7 rounded-lg object-cover shrink-0" />
              ) : (
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">attach_file</span>
              )}
              <span className="flex-1 truncate text-[11px] text-on-surface">{arq.name}</span>
              <button
                onClick={() => onRemoverArquivo(i)}
                aria-label="Remover arquivo"
                className="shrink-0 text-on-surface-variant/50 hover:text-error transition-colors ml-0.5"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*,text/plain,text/csv"
          onChange={onFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Anexar arquivo do computador"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
          title="Anexar arquivo do computador"
        >
          {uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-on-surface-variant" />
          ) : (
            <span className="material-symbols-outlined text-[18px]">attach_file</span>
          )}
        </button>
        <button
          type="button"
          onClick={onPickerOpen}
          disabled={uploading}
          aria-label="Documentos do cliente"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
          title="Documentos do cliente"
        >
          <span className="material-symbols-outlined text-[18px]">folder_open</span>
        </button>

        <textarea
          rows={1}
          className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] text-on-surface transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40"
          placeholder={arquivos.length > 0 ? 'Legenda (opcional)...' : 'Digite uma mensagem...'}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnviar() }
          }}
        />

        {!pausada && (
          <button
            type="button"
            onClick={() => setNaoModoIA(v => !v)}
            aria-label={naoModoIA ? 'Modo comunicado: IA continua ativa' : 'Clique para enviar sem pausar a IA'}
            title={naoModoIA ? 'Modo comunicado: IA continua ativa' : 'Clique para enviar sem pausar a IA'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
              naoModoIA
                ? 'border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366]'
                : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant/40 hover:text-on-surface-variant'
            }`}
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: naoModoIA ? "'FILL' 1" : "'FILL' 0" }}
            >
              smart_toy
            </span>
          </button>
        )}

        <button
          onClick={onEnviar}
          disabled={(!texto.trim() && arquivos.length === 0) || sending || uploading}
          aria-label="Enviar mensagem"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white transition-colors hover:bg-[#1fb855] disabled:opacity-40"
        >
          {sending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
          )}
        </button>
      </div>

      <p className="mt-2 text-center text-[11px] text-on-surface-variant/50">
        {pausada
          ? 'Você está no controle · IA pausada'
          : naoModoIA
            ? 'Modo comunicado · IA continuará ativa após o envio'
            : 'Ao enviar, a IA será pausada automaticamente'}
      </p>
    </div>
  )
}
