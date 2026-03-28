'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'

const STATUS_OPCOES = [
  { value: 'em_andamento',       label: 'Em andamento' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'resolvida',          label: 'Marcar como resolvida' },
]

type Props = { ordemId: string; statusAtual: string; temResposta: boolean }

export function OSResponderForm({ ordemId, statusAtual, temResposta }: Props) {
  const router = useRouter()
  const [resposta, setResposta]   = useState('')
  const [novoStatus, setNovoStatus] = useState(statusAtual)
  const [loading, setLoading]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!resposta.trim() && novoStatus === statusAtual) return
    setLoading(true)
    try {
      const body: any = { status: novoStatus }
      if (resposta.trim()) body.resposta = resposta.trim()
      const res = await fetch(`/api/crm/ordens-servico/${ordemId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success('Chamado atualizado!')
      router.refresh()
      setResposta('')
    } catch {
      toast.error('Erro ao atualizar chamado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
      <h3 className="text-[14px] font-semibold text-on-surface mb-4">
        {temResposta ? 'Atualizar resposta' : 'Responder chamado'}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-semibold text-on-surface-variant mb-1.5">Status</label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPCOES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => setNovoStatus(s.value)}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                  novoStatus === s.value
                    ? 'bg-primary text-white'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-semibold text-on-surface-variant mb-1.5">
            Resposta {!temResposta && <span className="text-on-surface-variant/50">(opcional)</span>}
          </label>
          <textarea
            className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 min-h-[100px] resize-y"
            placeholder="Digite a resposta para o cliente..."
            value={resposta}
            onChange={e => setResposta(e.target.value)}
            rows={4}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            disabled={loading || (!resposta.trim() && novoStatus === statusAtual)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {loading
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : <span className="material-symbols-outlined text-[16px]">send</span>
            }
            {novoStatus === 'resolvida' ? 'Resolver chamado' : 'Enviar resposta'}
          </button>
        </div>
      </form>
    </Card>
  )
}
