'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { Canal, PlanoTipo, FormaPagamento } from '@prisma/client'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

const CANAIS: { value: Canal; label: string }[] = [
  { value: 'site', label: 'Site' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'outro', label: 'Outro' },
]

const PLANOS: { value: PlanoTipo; label: string }[] = [
  { value: 'essencial', label: 'Essencial' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'empresarial', label: 'Empresarial' },
  { value: 'startup', label: 'Startup' },
]

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao', label: 'Cartão' },
]

type Props = {
  lead: {
    id: string
    contatoEntrada: string
    canal: Canal
    planoTipo: PlanoTipo | null
    valorNegociado: number | null | unknown
    formaPagamento: FormaPagamento | null
    vencimentoDia: number | null
    observacoes: string | null
  }
}

export function EditarLeadDrawer({ lead }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    contatoEntrada: lead.contatoEntrada,
    canal: lead.canal,
    planoTipo: lead.planoTipo ?? '',
    valorNegociado: lead.valorNegociado ? String(Number(lead.valorNegociado)) : '',
    formaPagamento: lead.formaPagamento ?? '',
    vencimentoDia: lead.vencimentoDia ? String(lead.vencimentoDia) : '',
    observacoes: lead.observacoes ?? '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.contatoEntrada.trim() || form.contatoEntrada.length < 3) return

    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contatoEntrada: form.contatoEntrada,
          canal: form.canal,
          planoTipo: form.planoTipo || null,
          valorNegociado: form.valorNegociado ? Number(form.valorNegociado) : null,
          formaPagamento: form.formaPagamento || null,
          vencimentoDia: form.vencimentoDia ? Number(form.vencimentoDia) : null,
          observacoes: form.observacoes || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Lead atualizado!')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar lead')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-sm font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-container-low"
      >
        Editar Lead
      </button>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>edit</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Editar Lead</h2>
            <p className="text-[12px] text-on-surface-variant">Atualize os dados do lead</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            <div>
              <label className={LABEL}>Contato <span className="text-error">*</span></label>
              <input
                className={INPUT}
                placeholder="Nome, e-mail ou telefone"
                value={form.contatoEntrada}
                onChange={e => set('contatoEntrada', e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className={LABEL}>Canal de origem</label>
              <div className="relative">
                <select className={SELECT} value={form.canal} onChange={e => set('canal', e.target.value)}>
                  {CANAIS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
              </div>
            </div>

            <div className="space-y-1 pt-1 pb-0.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Negociação</p>
            </div>

            <div>
              <label className={LABEL}>Plano de interesse</label>
              <div className="relative">
                <select className={SELECT} value={form.planoTipo} onChange={e => set('planoTipo', e.target.value)}>
                  <option value="">— Nenhum —</option>
                  {PLANOS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Valor estimado (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={INPUT}
                  placeholder="299.90"
                  value={form.valorNegociado}
                  onChange={e => set('valorNegociado', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>Vencimento (dia)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  className={INPUT}
                  placeholder="5"
                  value={form.vencimentoDia}
                  onChange={e => set('vencimentoDia', e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={LABEL}>Forma de pagamento</label>
              <div className="relative">
                <select className={SELECT} value={form.formaPagamento} onChange={e => set('formaPagamento', e.target.value)}>
                  <option value="">— Nenhuma —</option>
                  {FORMAS_PAGAMENTO.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
              </div>
            </div>

            <div>
              <label className={LABEL}>Observações</label>
              <textarea
                rows={3}
                className="w-full resize-none rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
                placeholder="Notas internas sobre este lead..."
                value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)}
              />
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
                : <span className="material-symbols-outlined text-[16px]">save</span>
              }
              Salvar
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
