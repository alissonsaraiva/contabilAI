'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function OSCancelarBtn({ osId }: { osId: string }) {
  const [confirmando, setConfirmando] = useState(false)
  const [loading, setLoading]         = useState(false)
  const router = useRouter()

  async function cancelar() {
    setLoading(true)
    try {
      await fetch(`/api/portal/ordens-servico/${osId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'cancelada' }),
      })
      router.refresh()
    } finally {
      setLoading(false)
      setConfirmando(false)
    }
  }

  if (confirmando) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-on-surface-variant">Confirma o cancelamento?</span>
        <button
          onClick={cancelar}
          disabled={loading}
          className="text-[12px] font-semibold text-error hover:underline disabled:opacity-50"
        >
          {loading ? 'Cancelando...' : 'Sim, cancelar'}
        </button>
        <button
          onClick={() => setConfirmando(false)}
          className="text-[12px] text-on-surface-variant hover:underline"
        >
          Não
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      className="text-[12px] font-semibold text-error hover:underline"
    >
      Cancelar chamado
    </button>
  )
}
