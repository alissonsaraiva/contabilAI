'use client'

import { useState } from 'react'

export function ReprocessarPdfButton({ contratoId }: { contratoId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle')
  const [erro, setErro] = useState('')

  async function handleClick() {
    setStatus('loading')
    setErro('')
    try {
      const res = await fetch(`/api/contratos/${contratoId}/reprocessar-pdf`, { method: 'POST' })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setErro(data.error ?? 'Erro desconhecido')
        setStatus('erro')
      } else {
        setStatus('ok')
        // recarrega a página para exibir o link de download
        setTimeout(() => window.location.reload(), 800)
      }
    } catch {
      setErro('Falha de conexão')
      setStatus('erro')
    }
  }

  if (status === 'ok') {
    return (
      <div className="flex items-center gap-2 text-[13px] font-semibold text-green-status">
        <span className="material-symbols-outlined text-[16px]">check_circle</span>
        PDF recuperado! Recarregando…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={status === 'loading'}
        className="flex items-center gap-2 text-[13px] font-semibold text-on-surface-variant hover:text-primary disabled:opacity-50"
      >
        <span
          className={`material-symbols-outlined text-[16px] ${status === 'loading' ? 'animate-spin' : ''}`}
        >
          {status === 'loading' ? 'progress_activity' : 'refresh'}
        </span>
        {status === 'loading' ? 'Buscando PDF…' : 'Recuperar PDF assinado'}
      </button>
      {status === 'erro' && (
        <p className="text-[12px] text-error">{erro}</p>
      )}
    </div>
  )
}
