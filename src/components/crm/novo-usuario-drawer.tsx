'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

const TIPOS = [
  { value: 'assistente', label: 'Assistente' },
  { value: 'contador', label: 'Contador' },
  { value: 'admin', label: 'Admin' },
]

const INIT = { nome: '', email: '', senha: '', tipo: 'assistente' }

export function NovoUsuarioDrawer() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(INIT)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [showSenha, setShowSenha] = useState(false)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErros(e => ({ ...e, [field]: '' }))
  }

  function reset() { setForm(INIT); setErros({}) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErros: Record<string, string> = {}
    if (!form.nome.trim() || form.nome.length < 2) newErros.nome = 'Nome obrigatório'
    if (!form.email.includes('@')) newErros.email = 'E-mail inválido'
    if (form.senha.length < 6) newErros.senha = 'Mínimo 6 caracteres'
    if (Object.keys(newErros).length) { setErros(newErros); return }

    setLoading(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.status === 409) { toast.error('E-mail já cadastrado'); return }
      if (res.status === 403) { toast.error('Apenas administradores podem criar usuários'); return }
      if (!res.ok) throw new Error()
      toast.success('Usuário criado!')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Erro ao criar usuário')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { setOpen(v); if (!v) reset() }}>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">person_add</span>
        Novo Usuário
      </button>

      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-card">
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Novo Usuário</h2>
            <p className="text-[12px] text-on-surface-variant">Crie um acesso ao CRM</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            <div>
              <label className={LABEL}>Nome completo <span className="text-error">*</span></label>
              <input className={INPUT} placeholder="Ex: Ana Paula Lima" value={form.nome} onChange={e => set('nome', e.target.value)} autoFocus />
              {erros.nome && <p className="mt-1.5 text-xs font-medium text-error">{erros.nome}</p>}
            </div>

            <div>
              <label className={LABEL}>E-mail <span className="text-error">*</span></label>
              <input type="email" className={INPUT} placeholder="ana@escritorio.com.br" value={form.email} onChange={e => set('email', e.target.value)} />
              {erros.email && <p className="mt-1.5 text-xs font-medium text-error">{erros.email}</p>}
            </div>

            <div>
              <label className={LABEL}>Senha <span className="text-error">*</span></label>
              <div className="relative">
                <input
                  type={showSenha ? 'text' : 'password'}
                  className={INPUT + ' pr-11'}
                  placeholder="Mínimo 6 caracteres"
                  value={form.senha}
                  onChange={e => set('senha', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">{showSenha ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
              {erros.senha && <p className="mt-1.5 text-xs font-medium text-error">{erros.senha}</p>}
            </div>

            <div>
              <label className={LABEL}>Tipo de acesso</label>
              <div className="relative">
                <select className={SELECT} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
              </div>
              <p className="mt-1.5 text-[12px] text-on-surface-variant/60">
                {form.tipo === 'admin' && 'Acesso total ao sistema, incluindo usuários e configurações.'}
                {form.tipo === 'contador' && 'Acesso completo ao CRM: clientes, leads, tarefas e configurações.'}
                {form.tipo === 'assistente' && 'Acesso limitado às tarefas e leads atribuídos a si.'}
              </p>
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
                : <span className="material-symbols-outlined text-[16px]">add</span>
              }
              Criar Usuário
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
