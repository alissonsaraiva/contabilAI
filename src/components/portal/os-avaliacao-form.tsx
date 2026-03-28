'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'

export function OSAvaliacaoForm({ ordemId }: { ordemId: string }) {
  const router  = useRouter()
  const [nota, setNota]       = useState(0)
  const [hover, setHover]     = useState(0)
  const [coment, setComent]   = useState('')
  const [loading, setLoading] = useState(false)

  async function enviar() {
    if (!nota) { toast.error('Selecione uma nota'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/portal/ordens-servico/${ordemId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ avaliacaoNota: nota, avaliacaoComent: coment }),
      })
      if (!res.ok) throw new Error()
      toast.success('Avaliação enviada! Obrigado.')
      router.refresh()
    } catch {
      toast.error('Erro ao enviar avaliação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-green-status/20 bg-green-status/5 p-5 rounded-[16px] shadow-sm">
      <h3 className="text-[14px] font-semibold text-on-surface mb-1">Como foi o atendimento?</h3>
      <p className="text-[12px] text-on-surface-variant/60 mb-4">
        Sua avaliação nos ajuda a melhorar continuamente.
      </p>
      <div className="flex gap-2 mb-4">
        {[1,2,3,4,5].map(n => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setNota(n)}
            className="focus:outline-none"
          >
            <span
              className={`material-symbols-outlined text-[32px] transition-colors ${
                n <= (hover || nota) ? 'text-yellow-500' : 'text-on-surface-variant/20'
              }`}
              style={{ fontVariationSettings: `'FILL' ${n <= (hover || nota) ? 1 : 0}` }}
            >
              star
            </span>
          </button>
        ))}
      </div>
      <textarea
        className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 mb-3"
        placeholder="Comentário opcional..."
        rows={2}
        value={coment}
        onChange={e => setComent(e.target.value)}
      />
      <button
        onClick={enviar}
        disabled={loading || !nota}
        className="flex items-center gap-2 rounded-xl bg-green-status px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-green-status/90 disabled:opacity-60 transition-colors"
      >
        {loading
          ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          : <span className="material-symbols-outlined text-[16px]">send</span>
        }
        Enviar avaliação
      </button>
    </Card>
  )
}
