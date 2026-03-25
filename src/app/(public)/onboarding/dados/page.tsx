'use client'

import { useState, use, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatCPF, formatCNPJ, formatTelefone } from '@/lib/utils'
import { useAutoSave } from '@/hooks/use-auto-save'

type Props = { searchParams: Promise<{ leadId?: string; plano?: string }> }

const PLANOS_COM_CNPJ = ['profissional', 'empresarial', 'startup']

const INPUT = 'w-full h-12 rounded-2xl border border-outline-variant/30 bg-white px-4 text-[15px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

function isPhone(v: string) {
  return /^[\d\s()\-+]+$/.test(v) && !/[@a-zA-Z]/.test(v)
}

export default function DadosPage({ searchParams }: Props) {
  const { leadId, plano = '' } = use(searchParams)
  const router = useRouter()
  const precisaCnpj = PLANOS_COM_CNPJ.includes(plano)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    nome: '', cpf: '', email: '', telefone: '',
    cnpj: '', razaoSocial: '', cidade: '',
  })
  const [erros, setErros] = useState<Record<string, string>>({})

  const autoSavePayload = useMemo(() => JSON.stringify({
    dadosJson: {
      'Nome completo': form.nome,
      'CPF': form.cpf,
      'E-mail': form.email,
      'Telefone': form.telefone,
      ...(form.cnpj && { 'CNPJ': form.cnpj }),
      ...(form.razaoSocial && { 'Razão Social': form.razaoSocial }),
      ...(form.cidade && { 'Cidade': form.cidade }),
    },
  }), [form])

  const saveStatus = useAutoSave(leadId, autoSavePayload)

  useEffect(() => {
    if (!leadId) return
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json())
      .then((lead: { contatoEntrada?: string; dadosJson?: Record<string, string> }) => {
        const dados = lead.dadosJson
        if (dados && Object.keys(dados).length > 0) {
          setForm(f => ({
            ...f,
            nome: dados['Nome completo'] ?? f.nome,
            cpf: dados['CPF'] ?? f.cpf,
            email: dados['E-mail'] ?? f.email,
            telefone: dados['Telefone'] ?? f.telefone,
            cnpj: dados['CNPJ'] ?? f.cnpj,
            razaoSocial: dados['Razão Social'] ?? f.razaoSocial,
            cidade: dados['Cidade'] ?? f.cidade,
          }))
        } else {
          const contato = lead.contatoEntrada ?? ''
          if (isPhone(contato)) setForm(f => ({ ...f, telefone: formatTelefone(contato) }))
          else if (/\S+@\S+\.\S+/.test(contato)) setForm(f => ({ ...f, email: contato }))
        }
      })
      .catch(() => {})
  }, [leadId])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErros(e => ({ ...e, [field]: '' }))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.nome.trim() || form.nome.trim().split(' ').length < 2) e.nome = 'Informe nome e sobrenome'
    if (!form.cpf || form.cpf.replace(/\D/g, '').length !== 11) e.cpf = 'CPF inválido (11 dígitos)'
    if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'E-mail inválido'
    if (form.telefone.replace(/\D/g, '').length < 10) e.telefone = 'Telefone inválido'
    if (precisaCnpj && form.cnpj.replace(/\D/g, '').length !== 14) e.cnpj = 'CNPJ inválido (14 dígitos)'
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || !leadId) return

    setLoading(true)
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'dados_preenchidos',
          stepAtual: 4,
          dadosJson: {
            'Nome completo': form.nome,
            'CPF': form.cpf,
            'E-mail': form.email,
            'Telefone': form.telefone,
            ...(form.cnpj && { 'CNPJ': form.cnpj }),
            ...(form.razaoSocial && { 'Razão Social': form.razaoSocial }),
            ...(form.cidade && { 'Cidade': form.cidade }),
          },
        }),
      })
      router.push(`/onboarding/revisao?leadId=${leadId}&plano=${plano}`)
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center pt-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <span className="material-symbols-outlined text-[28px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            person_edit
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Seus dados</h1>
        <p className="mt-1.5 text-[14px] text-on-surface-variant">
          Para prepararmos seu contrato e cadastro
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Dados pessoais */}
        <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-4">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">Dados pessoais</p>

          <div>
            <label className={LABEL}>Nome completo <span className="text-error">*</span></label>
            <input className={INPUT} placeholder="Seu nome e sobrenome" value={form.nome} onChange={e => set('nome', e.target.value)} autoComplete="name" />
            {erros.nome && <p className="mt-1.5 text-[12px] font-medium text-error">{erros.nome}</p>}
          </div>

          <div>
            <label className={LABEL}>CPF <span className="text-error">*</span></label>
            <input className={INPUT} placeholder="000.000.000-00" value={form.cpf} onChange={e => set('cpf', formatCPF(e.target.value))} inputMode="numeric" maxLength={14} />
            {erros.cpf && <p className="mt-1.5 text-[12px] font-medium text-error">{erros.cpf}</p>}
          </div>

          <div>
            <label className={LABEL}>E-mail <span className="text-error">*</span></label>
            <input className={INPUT} type="email" placeholder="seu@email.com" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
            {erros.email && <p className="mt-1.5 text-[12px] font-medium text-error">{erros.email}</p>}
          </div>

          <div>
            <label className={LABEL}>WhatsApp / Telefone <span className="text-error">*</span></label>
            <input className={INPUT} type="tel" placeholder="(85) 99999-9999" value={form.telefone} onChange={e => set('telefone', formatTelefone(e.target.value))} inputMode="tel" maxLength={15} />
            {erros.telefone && <p className="mt-1.5 text-[12px] font-medium text-error">{erros.telefone}</p>}
          </div>
        </div>

        {/* Dados da empresa */}
        <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-4">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Dados da empresa {!precisaCnpj && <span className="normal-case font-normal text-on-surface-variant/60">(opcional)</span>}
          </p>

          <div>
            <label className={LABEL}>CNPJ {precisaCnpj && <span className="text-error">*</span>}</label>
            <input className={INPUT} placeholder="00.000.000/0001-00" value={form.cnpj} onChange={e => set('cnpj', formatCNPJ(e.target.value))} inputMode="numeric" maxLength={18} />
            {erros.cnpj && <p className="mt-1.5 text-[12px] font-medium text-error">{erros.cnpj}</p>}
          </div>

          <div>
            <label className={LABEL}>Razão Social</label>
            <input className={INPUT} placeholder="Nome da empresa conforme CNPJ" value={form.razaoSocial} onChange={e => set('razaoSocial', e.target.value)} />
          </div>

          <div>
            <label className={LABEL}>Cidade</label>
            <input className={INPUT} placeholder="Ex: Fortaleza / CE" value={form.cidade} onChange={e => set('cidade', e.target.value)} />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>Continuar <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
          )}
        </button>

        {saveStatus !== 'idle' && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-on-surface-variant/50">
            {saveStatus === 'saving' ? (
              <><span className="h-3 w-3 animate-spin rounded-full border border-on-surface-variant/30 border-t-on-surface-variant/60" />Salvando...</>
            ) : (
              <><span className="material-symbols-outlined text-[13px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>Salvo automaticamente</>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
