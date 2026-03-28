'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'

const TIPO_OPTIONS = [
  { value: 'informativo', label: 'Informativo' },
  { value: 'alerta',      label: 'Alerta' },
  { value: 'obrigacao',   label: 'Obrigação' },
  { value: 'promocional', label: 'Promoção' },
]

const INPUT  = 'w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-2.5 text-[13px] text-on-surface focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL  = 'block text-[12px] font-semibold text-on-surface-variant mb-1'

export function ComunicadoForm() {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    titulo: '', conteudo: '', tipo: 'informativo', publicar: false, expiradoEm: '',
  })

  function set(field: string, value: any) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim() || !form.conteudo.trim()) {
      toast.error('Título e conteúdo são obrigatórios')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/crm/comunicados', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success(form.publicar ? 'Comunicado publicado!' : 'Rascunho salvo!')
      setForm({ titulo: '', conteudo: '', tipo: 'informativo', publicar: false, expiradoEm: '' })
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao salvar comunicado')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">add</span>
        Novo comunicado
      </button>
    )
  }

  return (
    <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
      <h3 className="text-[14px] font-semibold text-on-surface mb-4">Novo comunicado</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={LABEL}>Título *</label>
            <input className={INPUT} value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex: Prazo IRPF 2025" autoFocus />
          </div>
          <div className="col-span-2">
            <label className={LABEL}>Conteúdo *</label>
            <textarea className={INPUT + ' min-h-[80px] resize-y'} rows={3} value={form.conteudo} onChange={e => set('conteudo', e.target.value)} placeholder="Texto completo do comunicado..." />
          </div>
          <div>
            <label className={LABEL}>Tipo</label>
            <select className={INPUT + ' cursor-pointer'} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              {TIPO_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Expirar em (opcional)</label>
            <input type="date" className={INPUT} value={form.expiradoEm} onChange={e => set('expiradoEm', e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.publicar}
              onChange={e => set('publicar', e.target.checked)}
              className="h-4 w-4 rounded border-outline-variant accent-primary"
            />
            <span className="text-[13px] text-on-surface-variant">Publicar agora (visível no portal)</span>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
              {form.publicar ? 'Publicar' : 'Salvar rascunho'}
            </button>
          </div>
        </div>
      </form>
    </Card>
  )
}
