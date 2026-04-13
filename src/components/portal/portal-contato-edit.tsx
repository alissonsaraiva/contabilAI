'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatTelefone } from '@/lib/utils'
import { useCep } from '@/hooks/use-cep'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'
const LABEL = 'block text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant/50 mb-1.5'

const ESTADO_CIVIL_OPTS = [
  { value: 'solteiro',      label: 'Solteiro(a)' },
  { value: 'casado',        label: 'Casado(a)' },
  { value: 'divorciado',    label: 'Divorciado(a)' },
  { value: 'viuvo',         label: 'Viúvo(a)' },
  { value: 'uniao_estavel', label: 'União estável' },
]

type Props = {
  initial: {
    email: string
    estadoCivil: string | null
    telefone: string
    whatsapp: string | null
    cep: string | null
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    cidade: string | null
    uf: string | null
  }
}

export function PortalContatoEdit({ initial }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email:       initial.email ?? '',
    estadoCivil: initial.estadoCivil ?? '',
    telefone:    initial.telefone ?? '',
    whatsapp:    initial.whatsapp ?? '',
    cep:         initial.cep ?? '',
    logradouro:  initial.logradouro ?? '',
    numero:      initial.numero ?? '',
    complemento: initial.complemento ?? '',
    bairro:      initial.bairro ?? '',
    cidade:      initial.cidade ?? '',
    uf:          initial.uf ?? '',
  })

  const { buscarCep, loading: cepLoading } = useCep()

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function preencherCEP(cep: string) {
    await buscarCep(cep, (d) => {
      setForm(f => ({
        ...f,
        logradouro: d.logradouro || f.logradouro,
        bairro:     d.bairro     || f.bairro,
        cidade:     d.cidade     || f.cidade,
        uf:         d.uf         || f.uf,
      }))
    })
  }

  async function handleSave() {
    if (!form.email.includes('@')) {
      toast.error('E-mail inválido')
      return
    }
    if (!form.telefone || form.telefone.replace(/\D/g, '').length < 8) {
      toast.error('Telefone inválido')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/portal/perfil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:       form.email,
          estadoCivil: form.estadoCivil || null,
          telefone:    form.telefone.replace(/\D/g, ''),
          whatsapp:    form.whatsapp ? form.whatsapp.replace(/\D/g, '') : null,
          cep:         form.cep || null,
          logradouro:  form.logradouro || null,
          numero:      form.numero || null,
          complemento: form.complemento || null,
          bairro:      form.bairro || null,
          cidade:      form.cidade || null,
          uf:          form.uf || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error((err as any)?.error ?? 'Erro ao salvar.')
        return
      }
      toast.success('Dados atualizados com sucesso!')
      setOpen(false)
      router.refresh()
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low/60 px-3.5 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">edit</span>
        Editar dados
      </button>

      {/* Drawer overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative flex w-full max-w-md flex-col bg-card shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>edit</span>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-on-surface">Atualizar dados</h2>
                <p className="text-[12px] text-on-surface-variant">E-mail, contato e endereço</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-on-surface-variant/60 hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">

              {/* Dados pessoais */}
              <div className="space-y-1 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Dados pessoais</p>
              </div>

              <div>
                <label className={LABEL}>E-mail *</label>
                <input
                  type="email"
                  className={INPUT}
                  placeholder="seu@email.com"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                />
                <p className="mt-1.5 text-[11px] text-on-surface-variant/50">
                  O novo e-mail será usado nos próximos acessos ao portal.
                </p>
              </div>

              <div>
                <label className={LABEL}>Estado civil</label>
                <div className="relative">
                  <select className={SELECT} value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)}>
                    <option value="">— Não informado —</option>
                    {ESTADO_CIVIL_OPTS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>

              {/* Contato */}
              <div className="space-y-1 pt-2 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Contato</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Telefone *</label>
                  <input
                    className={INPUT}
                    placeholder="(11) 99999-9999"
                    value={form.telefone}
                    onChange={e => set('telefone', formatTelefone(e.target.value))}
                    inputMode="tel"
                    maxLength={15}
                  />
                </div>
                <div>
                  <label className={LABEL}>WhatsApp</label>
                  <input
                    className={INPUT}
                    placeholder="(11) 99999-9999"
                    value={form.whatsapp}
                    onChange={e => set('whatsapp', formatTelefone(e.target.value))}
                    inputMode="tel"
                    maxLength={15}
                  />
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-1 pt-2 pb-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Endereço</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className={LABEL}>Logradouro</label>
                  <input
                    className={INPUT}
                    placeholder="Rua das Flores"
                    value={form.logradouro}
                    onChange={e => set('logradouro', e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Número</label>
                  <input
                    className={INPUT}
                    placeholder="123"
                    value={form.numero}
                    onChange={e => set('numero', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Complemento</label>
                  <input
                    className={INPUT}
                    placeholder="Apto 4B"
                    value={form.complemento}
                    onChange={e => set('complemento', e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Bairro</label>
                  <input
                    className={INPUT}
                    placeholder="Centro"
                    value={form.bairro}
                    onChange={e => set('bairro', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>CEP</label>
                  <input
                    className={INPUT}
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={e => {
                      const v = e.target.value
                      set('cep', v)
                      if (v.replace(/\D/g, '').length === 8) void preencherCEP(v)
                    }}
                    inputMode="numeric"
                    maxLength={9}
                    disabled={cepLoading}
                  />
                </div>
                <div>
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

              <p className="text-[12px] text-on-surface-variant/50 leading-relaxed">
                Para alterar nome, CPF ou dados empresariais, entre em contato com o escritório.
              </p>
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
                type="button"
                onClick={handleSave}
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
          </div>
        </div>
      )}
    </>
  )
}
