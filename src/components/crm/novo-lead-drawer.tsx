'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

const CANAIS = [
  { value: 'site', label: 'Site' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'outro', label: 'Outro' },
]

export function NovoLeadDrawer() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ contatoEntrada: '', canal: 'site' })
  const [erro, setErro] = useState('')

  function reset() {
    setForm({ contatoEntrada: '', canal: 'site' })
    setErro('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (form.contatoEntrada.trim().length < 5) {
      setErro('Informe um nome, e-mail ou telefone (mínimo 5 caracteres).')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error()
      toast.success('Lead criado.')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Não foi possível criar o lead. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
        Novo Lead
      </button>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Novo Lead</h2>
            <p className="text-[12px] text-on-surface-variant">Registre uma nova oportunidade no pipeline</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">
            <div>
              <label className={LABEL}>
                Contato <span className="text-error">*</span>
              </label>
              <input
                className={INPUT}
                placeholder="Nome, e-mail ou telefone"
                value={form.contatoEntrada}
                onChange={e => setForm(f => ({ ...f, contatoEntrada: e.target.value }))}
                autoFocus
              />
              {erro && <p className="mt-1.5 text-xs font-medium text-error">{erro}</p>}
            </div>

            <div>
              <label className={LABEL}>Canal de origem</label>
              <div className="relative">
                <select
                  className={INPUT + ' appearance-none cursor-pointer pr-10'}
                  value={form.canal}
                  onChange={e => setForm(f => ({ ...f, canal: e.target.value }))}
                >
                  {CANAIS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">
                  expand_more
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 px-6 py-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <span className="material-symbols-outlined text-[16px]">add</span>
              }
              Criar Lead
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
