'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { formatCPF, formatCNPJ, formatTelefone } from '@/lib/utils'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

const PLANOS = [
  { value: 'essencial', label: 'Essencial' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'empresarial', label: 'Empresarial' },
  { value: 'startup', label: 'Startup' },
]

const REGIMES = [
  { value: 'MEI', label: 'MEI' },
  { value: 'SimplesNacional', label: 'Simples Nacional' },
  { value: 'LucroPresumido', label: 'Lucro Presumido' },
  { value: 'LucroReal', label: 'Lucro Real' },
  { value: 'Autonomo', label: 'Autônomo' },
]

const FORMAS_PAGAMENTO = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao', label: 'Cartão' },
]

const INIT = {
  nome: '',
  cpf: '',
  email: '',
  telefone: '',
  planoTipo: 'essencial',
  valorMensal: '',
  vencimentoDia: '5',
  formaPagamento: 'pix',
  cnpj: '',
  razaoSocial: '',
  regime: '',
  cidade: '',
  uf: '',
}

export function NovoClienteDrawer() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(INIT)
  const [erros, setErros] = useState<Record<string, string>>({})

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErros(e => ({ ...e, [field]: '' }))
  }

  function reset() {
    setForm(INIT)
    setErros({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErros: Record<string, string> = {}
    if (!form.nome.trim() || form.nome.length < 2) newErros.nome = 'Nome obrigatório (mín. 2 caracteres)'
    if (!form.cpf.replace(/\D/g, '') || form.cpf.replace(/\D/g, '').length < 11) newErros.cpf = 'CPF inválido'
    if (!form.email.includes('@')) newErros.email = 'E-mail inválido'
    if (!form.telefone || form.telefone.replace(/\D/g, '').length < 8) newErros.telefone = 'Telefone inválido'
    if (!form.valorMensal || isNaN(Number(form.valorMensal)) || Number(form.valorMensal) <= 0) newErros.valorMensal = 'Valor inválido'
    if (Object.keys(newErros).length) { setErros(newErros); return }

    setLoading(true)
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome,
          cpf: form.cpf.replace(/\D/g, ''),
          email: form.email,
          telefone: form.telefone,
          planoTipo: form.planoTipo,
          valorMensal: Number(form.valorMensal),
          vencimentoDia: Number(form.vencimentoDia),
          formaPagamento: form.formaPagamento,
          cnpj: form.cnpj || undefined,
          razaoSocial: form.razaoSocial || undefined,
          regime: form.regime || undefined,
          cidade: form.cidade || undefined,
          uf: form.uf || undefined,
        }),
      })
      if (res.status === 409) {
        toast.error('CPF ou e-mail já cadastrado')
        return
      }
      if (!res.ok) throw new Error()
      toast.success('Cliente cadastrado!')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('Erro ao cadastrar cliente')
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
        <span className="material-symbols-outlined text-[18px]">person_add</span>
        Novo Cliente
      </button>

      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0 bg-card">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Novo Cliente</h2>
            <p className="text-[12px] text-on-surface-variant">Cadastre um novo cliente na base</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            {/* Dados pessoais */}
            <div className="space-y-1 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Dados pessoais</p>
            </div>

            <div>
              <label className={LABEL}>Nome completo <span className="text-error">*</span></label>
              <input
                className={INPUT}
                placeholder="Ex: João da Silva"
                value={form.nome}
                onChange={e => set('nome', e.target.value)}
                autoFocus
              />
              {erros.nome && <p className="mt-1.5 text-xs font-medium text-error">{erros.nome}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>CPF <span className="text-error">*</span></label>
                <input
                  className={INPUT}
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={e => set('cpf', formatCPF(e.target.value))}
                  inputMode="numeric"
                  maxLength={14}
                />
                {erros.cpf && <p className="mt-1.5 text-xs font-medium text-error">{erros.cpf}</p>}
              </div>
              <div>
                <label className={LABEL}>Telefone <span className="text-error">*</span></label>
                <input
                  className={INPUT}
                  placeholder="(11) 99999-9999"
                  value={form.telefone}
                  onChange={e => set('telefone', formatTelefone(e.target.value))}
                  inputMode="tel"
                  maxLength={15}
                />
                {erros.telefone && <p className="mt-1.5 text-xs font-medium text-error">{erros.telefone}</p>}
              </div>
            </div>

            <div>
              <label className={LABEL}>E-mail <span className="text-error">*</span></label>
              <input
                type="email"
                className={INPUT}
                placeholder="joao@empresa.com"
                value={form.email}
                onChange={e => set('email', e.target.value)}
              />
              {erros.email && <p className="mt-1.5 text-xs font-medium text-error">{erros.email}</p>}
            </div>

            {/* Dados empresariais */}
            <div className="space-y-1 pt-2 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Dados empresariais (opcional)</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>CNPJ</label>
                <input
                  className={INPUT}
                  placeholder="00.000.000/0001-00"
                  value={form.cnpj}
                  onChange={e => set('cnpj', formatCNPJ(e.target.value))}
                  inputMode="numeric"
                  maxLength={18}
                />
              </div>
              <div>
                <label className={LABEL}>Regime</label>
                <div className="relative">
                  <select className={SELECT} value={form.regime} onChange={e => set('regime', e.target.value)}>
                    <option value="">— Selecione —</option>
                    {REGIMES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
            </div>

            <div>
              <label className={LABEL}>Razão social</label>
              <input
                className={INPUT}
                placeholder="Nome da empresa"
                value={form.razaoSocial}
                onChange={e => set('razaoSocial', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className={LABEL}>Cidade</label>
                <input
                  className={INPUT}
                  placeholder="São Paulo"
                  value={form.cidade}
                  onChange={e => set('cidade', e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL}>UF</label>
                <input
                  className={INPUT}
                  placeholder="SP"
                  maxLength={2}
                  value={form.uf}
                  onChange={e => set('uf', e.target.value.toUpperCase())}
                />
              </div>
            </div>

            {/* Plano */}
            <div className="space-y-1 pt-2 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Plano e pagamento</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Plano <span className="text-error">*</span></label>
                <div className="relative">
                  <select className={SELECT} value={form.planoTipo} onChange={e => set('planoTipo', e.target.value)}>
                    {PLANOS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
              <div>
                <label className={LABEL}>Valor mensal <span className="text-error">*</span></label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={INPUT}
                  placeholder="299.90"
                  value={form.valorMensal}
                  onChange={e => set('valorMensal', e.target.value)}
                />
                {erros.valorMensal && <p className="mt-1.5 text-xs font-medium text-error">{erros.valorMensal}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Forma de pagamento <span className="text-error">*</span></label>
                <div className="relative">
                  <select className={SELECT} value={form.formaPagamento} onChange={e => set('formaPagamento', e.target.value)}>
                    {FORMAS_PAGAMENTO.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
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
              Cadastrar Cliente
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
