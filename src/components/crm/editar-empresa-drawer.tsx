'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { formatCNPJ } from '@/lib/utils'
import type { Regime } from '@prisma/client'

const INPUT  = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL  = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

const REGIMES: { value: Regime; label: string }[] = [
  { value: 'MEI',            label: 'MEI' },
  { value: 'SimplesNacional', label: 'Simples Nacional' },
  { value: 'LucroPresumido', label: 'Lucro Presumido' },
  { value: 'LucroReal',      label: 'Lucro Real' },
  { value: 'Autonomo',       label: 'Autônomo' },
]

export type EmpresaEditData = {
  id: string
  razaoSocial: string | null
  nomeFantasia: string | null
  cnpj: string | null
  regime: Regime | null
}

type Props = { empresa: EmpresaEditData; open: boolean; onClose: () => void }

export function EditarEmpresaDrawer({ empresa, open, onClose }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    razaoSocial: empresa.razaoSocial ?? '',
    nomeFantasia: empresa.nomeFantasia ?? '',
    cnpj: empresa.cnpj ?? '',
    regime: empresa.regime ?? '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/empresas/${empresa.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razaoSocial: form.razaoSocial || null,
          nomeFantasia: form.nomeFantasia || null,
          cnpj: form.cnpj || null,
          regime: form.regime || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Empresa atualizada!')
      onClose()
      router.refresh()
    } catch {
      toast.error('Erro ao atualizar empresa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>edit</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Editar Empresa</h2>
            <p className="text-[12px] text-on-surface-variant">{empresa.razaoSocial ?? empresa.nomeFantasia ?? 'Empresa'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            <div>
              <label className={LABEL}>Razão social</label>
              <input className={INPUT} value={form.razaoSocial} onChange={e => set('razaoSocial', e.target.value)} autoFocus />
            </div>

            <div>
              <label className={LABEL}>Nome fantasia</label>
              <input className={INPUT} value={form.nomeFantasia} onChange={e => set('nomeFantasia', e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>CNPJ</label>
                <input className={INPUT} placeholder="00.000.000/0001-00" value={form.cnpj} onChange={e => set('cnpj', formatCNPJ(e.target.value))} inputMode="numeric" maxLength={18} />
              </div>
              <div>
                <label className={LABEL}>Regime tributário</label>
                <div className="relative">
                  <select className={SELECT} value={form.regime} onChange={e => set('regime', e.target.value)}>
                    <option value="">— Selecione —</option>
                    {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
            </div>

          </div>

          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container">
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
