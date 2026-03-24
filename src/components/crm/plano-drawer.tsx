'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { PlanoTipo } from '@prisma/client'
import { PLANO_LABELS } from '@/types'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

type PlanoData = {
  id: string
  tipo: PlanoTipo
  nome: string
  descricao: string
  valorMinimo: number
  valorMaximo: number
  servicos: string[]
  destaque: boolean
  ativo: boolean
}

type Props = {
  plano?: PlanoData
  tiposDisponiveis: PlanoTipo[]
}

export function PlanoDrawer({ plano, tiposDisponiveis }: Props) {
  const router = useRouter()
  const isEdit = !!plano
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    tipo: plano?.tipo ?? tiposDisponiveis[0] ?? 'essencial',
    nome: plano?.nome ?? '',
    descricao: plano?.descricao ?? '',
    valorMinimo: plano?.valorMinimo ? String(plano.valorMinimo) : '',
    valorMaximo: plano?.valorMaximo ? String(plano.valorMaximo) : '',
    servicosText: plano?.servicos?.join('\n') ?? '',
    destaque: plano?.destaque ?? false,
    ativo: plano?.ativo ?? true,
  })

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim() || !form.valorMinimo || !form.valorMaximo) return

    const servicos = form.servicosText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)

    const body = {
      tipo: form.tipo,
      nome: form.nome,
      descricao: form.descricao || null,
      valorMinimo: Number(form.valorMinimo),
      valorMaximo: Number(form.valorMaximo),
      servicos,
      destaque: form.destaque,
      ativo: form.ativo,
    }

    setLoading(true)
    try {
      const res = await fetch(
        isEdit ? `/api/planos/${plano!.id}` : '/api/planos',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (res.status === 409) { toast.error('Já existe um plano com este tipo'); return }
      if (!res.ok) throw new Error()
      toast.success(isEdit ? 'Plano atualizado!' : 'Plano criado!')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao salvar plano')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        className={isEdit
          ? 'flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:opacity-70 transition-opacity'
          : 'flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors'
        }
      >
        <span className="material-symbols-outlined text-[16px]">{isEdit ? 'edit' : 'add'}</span>
        {isEdit ? 'Editar plano' : 'Novo Plano'}
      </button>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card">
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">{isEdit ? 'Editar Plano' : 'Novo Plano'}</h2>
            <p className="text-[12px] text-on-surface-variant">{isEdit ? PLANO_LABELS[plano!.tipo] : 'Configure o novo plano'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            {/* Tipo — só para criação */}
            {!isEdit && tiposDisponiveis.length > 0 && (
              <div>
                <label className={LABEL}>Tipo de plano <span className="text-error">*</span></label>
                <div className="relative">
                  <select className={SELECT} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                    {tiposDisponiveis.map(t => (
                      <option key={t} value={t}>{PLANO_LABELS[t]}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
            )}

            <div>
              <label className={LABEL}>Nome exibido <span className="text-error">*</span></label>
              <input className={INPUT} placeholder="Ex: Plano Essencial MEI" value={form.nome} onChange={e => set('nome', e.target.value)} autoFocus />
            </div>

            <div>
              <label className={LABEL}>Descrição</label>
              <textarea
                rows={2}
                className="w-full resize-none rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
                placeholder="Ideal para MEI e autônomos que precisam de contabilidade básica."
                value={form.descricao}
                onChange={e => set('descricao', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Valor mínimo (R$) <span className="text-error">*</span></label>
                <input type="number" min="0" step="0.01" className={INPUT} placeholder="199.00" value={form.valorMinimo} onChange={e => set('valorMinimo', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Valor máximo (R$) <span className="text-error">*</span></label>
                <input type="number" min="0" step="0.01" className={INPUT} placeholder="399.00" value={form.valorMaximo} onChange={e => set('valorMaximo', e.target.value)} />
              </div>
            </div>

            <div>
              <label className={LABEL}>Serviços inclusos</label>
              <textarea
                rows={5}
                className="w-full resize-none rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
                placeholder={'DAS/MEI mensal\nDeclaração IRPF\nCertidões negativas\nWhatsApp ilimitado'}
                value={form.servicosText}
                onChange={e => set('servicosText', e.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-on-surface-variant/60">Um serviço por linha</p>
            </div>

            {/* Toggles */}
            <div className="space-y-3 rounded-[10px] border border-outline-variant/20 bg-surface-container-low p-4">
              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-on-surface">Plano em destaque</p>
                  <p className="text-[11px] text-on-surface-variant/70">Exibido com borda e badge especial na landing page</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('destaque', !form.destaque)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.destaque ? 'bg-primary' : 'bg-outline-variant/40'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.destaque ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </label>

              <div className="border-t border-outline-variant/15" />

              <label className="flex cursor-pointer items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-on-surface">Plano ativo</p>
                  <p className="text-[11px] text-on-surface-variant/70">Planos inativos não aparecem no onboarding</p>
                </div>
                <button
                  type="button"
                  onClick={() => set('ativo', !form.ativo)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${form.ativo ? 'bg-primary' : 'bg-outline-variant/40'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.ativo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 px-6 py-4">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container">
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
              {isEdit ? 'Salvar' : 'Criar Plano'}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
