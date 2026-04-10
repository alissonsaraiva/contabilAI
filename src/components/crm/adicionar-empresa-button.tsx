'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { formatCNPJ } from '@/lib/utils'
import { useCnpj } from '@/hooks/use-cnpj'
import type { Regime } from '@prisma/client'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

const REGIMES: { value: Regime; label: string }[] = [
  { value: 'MEI', label: 'MEI' },
  { value: 'SimplesNacional', label: 'Simples Nacional' },
  { value: 'LucroPresumido', label: 'Lucro Presumido' },
  { value: 'LucroReal', label: 'Lucro Real' },
  { value: 'Autonomo', label: 'Autônomo' },
]

type Props = { clienteId: string; clienteNome: string }

export function AdicionarEmpresaButton({ clienteId, clienteNome }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant shadow-sm transition-all hover:bg-surface-container hover:border-outline-variant/50"
      >
        <span className="material-symbols-outlined text-[14px]">add_business</span>
        Adicionar Empresa
      </button>

      <AdicionarEmpresaDrawer
        clienteId={clienteId}
        clienteNome={clienteNome}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function AdicionarEmpresaDrawer({
  clienteId,
  clienteNome,
  open,
  onClose,
}: Props & { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { buscarCnpj, loading: cnpjLoading } = useCnpj()
  const [form, setForm] = useState({
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    regime: '' as Regime | '',
  })

  function set<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function preencherCNPJ(cnpj: string) {
    const dados = await buscarCnpj(cnpj)
    if (!dados) return
    setForm(f => ({
      ...f,
      razaoSocial: dados.razaoSocial || f.razaoSocial,
      nomeFantasia: dados.nomeFantasia || f.nomeFantasia,
      regime: (dados.regime !== 'outro' ? dados.regime : f.regime) as Regime | '',
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.razaoSocial.trim() && !form.cnpj.replace(/\D/g, '')) {
      toast.error('Informe ao menos o CNPJ ou a Razão Social.')
      return
    }
    const cnpjRaw = form.cnpj.replace(/\D/g, '')
    if (cnpjRaw && cnpjRaw.length !== 14) {
      toast.error('CNPJ inválido — informe os 14 dígitos.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/empresas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj: form.cnpj || null,
          razaoSocial: form.razaoSocial || null,
          nomeFantasia: form.nomeFantasia || null,
          regime: form.regime || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erro ao adicionar empresa.')
      }
      toast.success('Empresa adicionada com sucesso!')
      setForm({ cnpj: '', razaoSocial: '', nomeFantasia: '', regime: '' })
      onClose()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar empresa.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>add_business</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Adicionar Empresa</h2>
            <p className="text-[12px] text-on-surface-variant">{clienteNome}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">
            <div>
              <label className={LABEL}>CNPJ</label>
              <div className="relative">
                <input
                  className={INPUT}
                  placeholder="00.000.000/0001-00"
                  value={form.cnpj}
                  onChange={e => {
                    const v = formatCNPJ(e.target.value)
                    set('cnpj', v)
                    if (v.replace(/\D/g, '').length === 14) preencherCNPJ(v)
                  }}
                  inputMode="numeric"
                  maxLength={18}
                  autoFocus
                />
                {cnpjLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                )}
              </div>
            </div>

            <div>
              <label className={LABEL}>Razão social</label>
              <input
                className={INPUT}
                value={form.razaoSocial}
                onChange={e => set('razaoSocial', e.target.value)}
                placeholder="Nome oficial da empresa"
              />
            </div>

            <div>
              <label className={LABEL}>Nome fantasia</label>
              <input
                className={INPUT}
                value={form.nomeFantasia}
                onChange={e => set('nomeFantasia', e.target.value)}
                placeholder="Nome comercial (opcional)"
              />
            </div>

            <div>
              <label className={LABEL}>Regime tributário</label>
              <div className="relative">
                <select
                  className={SELECT}
                  value={form.regime}
                  onChange={e => set('regime', e.target.value as Regime | '')}
                >
                  <option value="">— Selecione —</option>
                  {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
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
                : <span className="material-symbols-outlined text-[16px]">add_business</span>
              }
              Adicionar
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
