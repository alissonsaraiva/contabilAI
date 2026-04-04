'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { formatCPF } from '@/lib/utils'

const INPUT  = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL  = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

type Props = { empresaId: string }

const EMPTY = {
  nome:         '',
  cpf:          '',
  qualificacao: '',
  participacao: '',
  email:        '',
  telefone:     '',
  whatsapp:     '',
  principal:    false,
}

export function AdicionarSocioDrawer({ empresaId }: Props) {
  const router  = useRouter()
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [form,    setForm]    = useState(EMPTY)

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) { toast.error('Informe o nome do sócio.'); return }
    if (!form.cpf.trim())  { toast.error('Informe o CPF do sócio.');  return }

    setLoading(true)
    try {
      const res = await fetch(`/api/crm/empresas/${empresaId}/socios`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          nome:         form.nome.trim(),
          cpf:          form.cpf,
          qualificacao: form.qualificacao.trim() || null,
          participacao: form.participacao ? Number(form.participacao) : null,
          email:        form.email.trim()    || null,
          telefone:     form.telefone.trim() || null,
          whatsapp:     form.whatsapp.trim() || null,
          principal:    form.principal,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Erro ao adicionar sócio')
      }
      toast.success('Sócio adicionado!')
      setOpen(false)
      setForm(EMPTY)
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao adicionar sócio')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-card px-3 py-2 text-[13px] font-semibold text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[15px]">person_add</span>
        Adicionar sócio
      </button>

      <Sheet open={open} onOpenChange={(v) => { if (!v) setOpen(false) }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
          <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-on-surface">Adicionar Sócio</h2>
              <p className="text-[12px] text-on-surface-variant">Preencha os dados do novo sócio</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

              <div>
                <label className={LABEL}>Nome completo <span className="text-error">*</span></label>
                <input className={INPUT} value={form.nome} onChange={e => set('nome', e.target.value)} autoFocus placeholder="Nome do sócio" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>CPF <span className="text-error">*</span></label>
                  <input
                    className={INPUT}
                    value={form.cpf}
                    onChange={e => set('cpf', formatCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    maxLength={14}
                  />
                </div>
                <div>
                  <label className={LABEL}>Participação (%)</label>
                  <input
                    className={INPUT}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.participacao}
                    onChange={e => set('participacao', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>Qualificação</label>
                <input className={INPUT} value={form.qualificacao} onChange={e => set('qualificacao', e.target.value)} placeholder="Ex: Sócio administrador" />
              </div>

              <div>
                <label className={LABEL}>E-mail</label>
                <input className={INPUT} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Telefone</label>
                  <input className={INPUT} value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className={LABEL}>WhatsApp</label>
                  <input className={INPUT} value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="(00) 00000-0000" />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.principal}
                  onChange={e => set('principal', e.target.checked)}
                  className="h-4 w-4 rounded border-outline-variant/40 accent-primary"
                />
                <span className="text-[13px] font-medium text-on-surface">Sócio principal</span>
              </label>

            </div>

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
                Adicionar
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
