'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = {
  leadId: string
  /** Status atual do contrato, se existir */
  contratoStatus?: string
  /** URL de assinatura já gerada, se disponível */
  signUrl?: string | null
  /** Modo compacto para a barra de ações do header */
  compact?: boolean
}

export function EnviarDocuSealBtn({ leadId, contratoStatus, signUrl, compact }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const jaEnviado = contratoStatus === 'aguardando_assinatura' || contratoStatus === 'parcialmente_assinado'
  const jaAssinado = contratoStatus === 'assinado'

  async function handleEnviar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/contrato/enviar`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string; signUrl?: string }

      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao enviar para DocuSeal')
        return
      }

      toast.success('Contrato enviado! O cliente receberá um e-mail com o link de assinatura.')
      router.refresh()
    } catch {
      toast.error('Erro de conexão ao enviar contrato')
    } finally {
      setLoading(false)
    }
  }

  if (jaAssinado) return null

  if (compact) {
    return (
      <button
        onClick={handleEnviar}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-4 py-2 text-[13px] font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-60"
      >
        {loading ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-surface/20 border-t-on-surface" />
        ) : (
          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>draw</span>
        )}
        {jaEnviado ? 'Reenviar DocuSeal' : 'Enviar para assinatura'}
      </button>
    )
  }

  return (
    <div className="mt-4 space-y-2">
      <button
        onClick={handleEnviar}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Enviando para DocuSeal…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              draw
            </span>
            {jaEnviado ? 'Reenviar para assinatura' : 'Enviar para assinatura (DocuSeal)'}
          </>
        )}
      </button>

      {jaEnviado && signUrl && (
        <a
          href={signUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-orange-status/10 px-4 py-3 text-[13px] font-semibold text-orange-status transition-colors hover:bg-orange-status/20"
        >
          <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          Abrir link de assinatura
          <span className="ml-auto text-[11px] font-normal opacity-70">Enviar ao cliente</span>
        </a>
      )}
    </div>
  )
}
