'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'

const TIPO_OPTIONS = [
  { value: 'duvida',      label: 'Dúvida',       icon: 'help' },
  { value: 'solicitacao', label: 'Solicitação',   icon: 'assignment' },
  { value: 'reclamacao',  label: 'Reclamação',    icon: 'report' },
  { value: 'documento',   label: 'Documento',     icon: 'description' },
  { value: 'outros',      label: 'Outros',        icon: 'category' },
]

const INPUT  = 'w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL  = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

export default function NovoChamadoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    tipo:      'duvida',
    titulo:    '',
    descricao: '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim() || !form.descricao.trim()) {
      toast.error('Adicione um título e descreva sua solicitação para abrir o chamado.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/portal/chamados', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Não foi possível abrir o chamado. Tente novamente.')
      }
      const ordem = await res.json()
      toast.success('Chamado aberto! Nossa equipe responderá em breve.')
      router.push(`/portal/suporte/chamados/${ordem.id}`)
    } catch (e: any) {
      toast.error(e.message ?? 'Não foi possível abrir o chamado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div>
          <h1 className="font-headline text-xl font-semibold text-on-surface">Abrir chamado</h1>
          <p className="text-[12px] text-on-surface-variant/60">
            Descreva sua dúvida ou solicitação. Nossa equipe responderá em breve.
          </p>
        </div>
      </div>

      <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">

          {/* Tipo */}
          <div>
            <label className={LABEL}>Tipo de chamado</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {TIPO_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('tipo', opt.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-[10px] border px-3 py-3 text-[12px] font-semibold transition-colors ${
                    form.tipo === opt.value
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:border-primary/20 hover:bg-primary/5'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: `'FILL' ${form.tipo === opt.value ? 1 : 0}` }}>
                    {opt.icon}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className={LABEL}>Título do chamado *</label>
            <input
              className={INPUT}
              placeholder="Ex: Dúvida sobre emissão de nota fiscal"
              value={form.titulo}
              onChange={e => set('titulo', e.target.value)}
              maxLength={120}
              autoFocus
            />
          </div>

          {/* Descrição */}
          <div>
            <label className={LABEL}>Descrição detalhada *</label>
            <textarea
              className={INPUT + ' min-h-[120px] resize-y'}
              placeholder="Descreva com detalhes o que você precisa ou o problema que está enfrentando..."
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              rows={5}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/portal/suporte"
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading || !form.titulo.trim() || !form.descricao.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <span className="material-symbols-outlined text-[16px]">send</span>
              }
              Enviar chamado
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
