'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { PlanoTipo, FormaPagamento, Regime, StatusCliente } from '@prisma/client'
import { formatCNPJ, formatTelefone } from '@/lib/utils'
import { useCnpj } from '@/hooks/use-cnpj'
import { useCep } from '@/hooks/use-cep'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

const PLANOS: { value: PlanoTipo; label: string }[] = [
  { value: 'essencial', label: 'Essencial' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'empresarial', label: 'Empresarial' },
  { value: 'startup', label: 'Startup' },
]

const REGIMES: { value: Regime; label: string }[] = [
  { value: 'MEI', label: 'MEI' },
  { value: 'SimplesNacional', label: 'Simples Nacional' },
  { value: 'LucroPresumido', label: 'Lucro Presumido' },
  { value: 'LucroReal', label: 'Lucro Real' },
  { value: 'Autonomo', label: 'Autônomo' },
]

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao', label: 'Cartão' },
]

export type ClienteEditData = {
  id: string
  nome: string
  cpf: string
  email: string
  telefone: string
  whatsapp: string | null
  rg: string | null
  dataNascimento: string | null
  estadoCivil: string | null
  profissao: string | null
  nacionalidade: string | null
  tipoContribuinte: string
  planoTipo: PlanoTipo
  valorMensal: number
  vencimentoDia: number
  formaPagamento: FormaPagamento
  cnpj: string | null
  razaoSocial: string | null
  regime: Regime | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  status: StatusCliente
  observacoesInternas: string | null
}

type Props = { cliente: ClienteEditData; open: boolean; onClose: () => void }

export function EditarClienteDrawer({ cliente, open, onClose }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const { buscarCnpj, loading: cnpjLoading } = useCnpj()
  const { buscarCep,  loading: cepLoading  } = useCep()
  const [form, setForm] = useState({
    nome: cliente.nome,
    email: cliente.email,
    telefone: cliente.telefone,
    whatsapp: cliente.whatsapp ?? '',
    rg: cliente.rg ?? '',
    dataNascimento: cliente.dataNascimento ? cliente.dataNascimento.slice(0, 10) : '',
    estadoCivil: cliente.estadoCivil ?? '',
    profissao: cliente.profissao ?? '',
    nacionalidade: cliente.nacionalidade ?? 'Brasileiro(a)',
    tipoContribuinte: cliente.tipoContribuinte ?? 'pj',
    planoTipo: cliente.planoTipo,
    valorMensal: String(Number(cliente.valorMensal)),
    vencimentoDia: String(cliente.vencimentoDia),
    formaPagamento: cliente.formaPagamento,
    cnpj: cliente.cnpj ?? '',
    razaoSocial: cliente.razaoSocial ?? '',
    regime: cliente.regime ?? '',
    cep: cliente.cep ?? '',
    logradouro: cliente.logradouro ?? '',
    numero: cliente.numero ?? '',
    complemento: cliente.complemento ?? '',
    bairro: cliente.bairro ?? '',
    cidade: cliente.cidade ?? '',
    uf: cliente.uf ?? '',
    observacoesInternas: cliente.observacoesInternas ?? '',
  })

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

  async function preencherCNPJ(cnpj: string) {
    const dados = await buscarCnpj(cnpj)
    if (!dados) return
    setForm(f => ({
      ...f,
      razaoSocial: dados.razaoSocial || f.razaoSocial,
      cidade:      dados.municipio   || f.cidade,
      uf:          dados.uf          || f.uf,
      regime: dados.regime !== 'outro' ? dados.regime : f.regime,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim() || !form.email.includes('@')) return

    setLoading(true)
    try {
      const res = await fetch(`/api/clientes/${cliente.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:                form.nome,
          email:               form.email,
          telefone:            form.telefone,
          whatsapp:            form.whatsapp || null,
          rg:                  form.rg || null,
          dataNascimento:      form.dataNascimento ? new Date(form.dataNascimento).toISOString() : null,
          estadoCivil:         form.estadoCivil || null,
          profissao:           form.profissao || null,
          nacionalidade:       form.nacionalidade || null,
          tipoContribuinte:    form.tipoContribuinte,
          planoTipo:           form.planoTipo,
          valorMensal:         Number(form.valorMensal),
          vencimentoDia:       Number(form.vencimentoDia),
          formaPagamento:      form.formaPagamento,
          cnpj:                form.cnpj || null,
          razaoSocial:         form.razaoSocial || null,
          regime:              form.regime || null,
          cep:                 form.cep || null,
          logradouro:          form.logradouro || null,
          numero:              form.numero || null,
          complemento:         form.complemento || null,
          bairro:              form.bairro || null,
          cidade:              form.cidade || null,
          uf:                  form.uf || null,
          observacoesInternas: form.observacoesInternas || null,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Dados do cliente salvos.')
      onClose()
      router.refresh()
    } catch {
      toast.error('Não foi possível salvar o cliente. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>edit</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Editar Cliente</h2>
            <p className="text-[12px] text-on-surface-variant">{cliente.nome}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">

            <div className="space-y-1 pb-0.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Dados pessoais</p>
            </div>

            <div>
              <label className={LABEL}>Nome completo <span className="text-error">*</span></label>
              <input className={INPUT} value={form.nome} onChange={e => set('nome', e.target.value)} autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>E-mail <span className="text-error">*</span></label>
                <input type="email" className={INPUT} value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Telefone</label>
                <input className={INPUT} value={form.telefone} onChange={e => set('telefone', formatTelefone(e.target.value))} inputMode="tel" maxLength={15} />
              </div>
            </div>

            <div>
              <label className={LABEL}>WhatsApp</label>
              <input className={INPUT} value={form.whatsapp} onChange={e => set('whatsapp', formatTelefone(e.target.value))} inputMode="tel" maxLength={15} placeholder="Número para envio de mensagens" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>RG</label>
                <input className={INPUT} value={form.rg} onChange={e => set('rg', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Data de nascimento</label>
                <input type="date" className={INPUT} value={form.dataNascimento} onChange={e => set('dataNascimento', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Estado civil</label>
                <div className="relative">
                  <select className={SELECT} value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)}>
                    <option value="">— Selecione —</option>
                    <option value="solteiro">Solteiro(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="viuvo">Viúvo(a)</option>
                    <option value="uniao_estavel">União estável</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
              <div>
                <label className={LABEL}>Tipo de contribuinte</label>
                <div className="relative">
                  <select className={SELECT} value={form.tipoContribuinte} onChange={e => set('tipoContribuinte', e.target.value)}>
                    <option value="pj">Pessoa Jurídica</option>
                    <option value="pf">Pessoa Física</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Profissão</label>
                <input className={INPUT} value={form.profissao} onChange={e => set('profissao', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Nacionalidade</label>
                <input className={INPUT} value={form.nacionalidade} onChange={e => set('nacionalidade', e.target.value)} />
              </div>
            </div>

            <div className="space-y-1 pt-2 pb-0.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Dados empresariais</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                      if (v.replace(/\D/g, '').length === 14) void preencherCNPJ(v)
                    }}
                    inputMode="numeric"
                    maxLength={18}
                  />
                  {cnpjLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  )}
                </div>
              </div>
              <div>
                <label className={LABEL}>Regime</label>
                <div className="relative">
                  <select className={SELECT} value={form.regime} onChange={e => set('regime', e.target.value)}>
                    <option value="">— Selecione —</option>
                    {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
            </div>

            <div>
              <label className={LABEL}>Razão social</label>
              <input className={INPUT} value={form.razaoSocial} onChange={e => set('razaoSocial', e.target.value)} />
            </div>

            <div className="space-y-1 pt-2 pb-0.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Endereço</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>CEP</label>
                <input
                  className={INPUT}
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
              <div className="col-span-2">
                <label className={LABEL}>Logradouro</label>
                <input className={INPUT} value={form.logradouro} onChange={e => set('logradouro', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Número</label>
                <input className={INPUT} value={form.numero} onChange={e => set('numero', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={LABEL}>Complemento</label>
                <input className={INPUT} value={form.complemento} onChange={e => set('complemento', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1">
                <label className={LABEL}>Bairro</label>
                <input className={INPUT} value={form.bairro} onChange={e => set('bairro', e.target.value)} />
              </div>
              <div className="col-span-1">
                <label className={LABEL}>Cidade</label>
                <input className={INPUT} value={form.cidade} onChange={e => set('cidade', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>UF</label>
                <input className={INPUT} maxLength={2} value={form.uf} onChange={e => set('uf', e.target.value.toUpperCase())} />
              </div>
            </div>

            <div className="space-y-1 pt-2 pb-0.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Plano e pagamento</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Plano <span className="text-error">*</span></label>
                <div className="relative">
                  <select className={SELECT} value={form.planoTipo} onChange={e => set('planoTipo', e.target.value)}>
                    {PLANOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
              <div>
                <label className={LABEL}>Valor mensal (R$)</label>
                <input type="number" min="0" step="0.01" className={INPUT} value={form.valorMensal} onChange={e => set('valorMensal', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Forma de pagamento</label>
                <div className="relative">
                  <select className={SELECT} value={form.formaPagamento} onChange={e => set('formaPagamento', e.target.value)}>
                    {FORMAS_PAGAMENTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
                </div>
              </div>
              <div>
                <label className={LABEL}>Vencimento (dia)</label>
                <input type="number" min="1" max="31" className={INPUT} value={form.vencimentoDia} onChange={e => set('vencimentoDia', e.target.value)} />
              </div>
            </div>

            <div className="space-y-1 pt-2 pb-0.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Observações internas</p>
            </div>

            <div>
              <textarea
                className={`${INPUT} min-h-[80px] resize-none`}
                value={form.observacoesInternas}
                onChange={e => set('observacoesInternas', e.target.value)}
                placeholder="Notas internas sobre o cliente (não visível ao cliente)"
                rows={3}
              />
            </div>

          </div>

          {/* Footer */}
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
