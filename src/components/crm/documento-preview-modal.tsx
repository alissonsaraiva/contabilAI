'use client'

import { useEffect } from 'react'

type Props = {
  nome: string
  url: string
  mimeType: string | null
  onClose: () => void
}

export function DocumentoPreviewModal({ nome, url, mimeType, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])
  const isPdf = mimeType === 'application/pdf' || nome.toLowerCase().endsWith('.pdf')
  const isImage = mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(nome)

  if (!isPdf && !isImage) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="relative flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/15 px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant/60" style={{ fontVariationSettings: "'FILL' 1" }}>
              {isPdf ? 'picture_as_pdf' : 'image'}
            </span>
            <span className="truncate text-[13px] font-medium text-on-surface">{nome}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-primary transition-colors"
              title="Abrir em nova aba"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            </a>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-surface-container-low/50">
          {isPdf ? (
            <iframe
              src={url}
              className="h-full w-full"
              title={`Preview de ${nome}`}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={nome}
                className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
