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

function formatCEP(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export default function DadosPage({ searchParams }: Props) {
  const { leadId, plano = '' } = use(searchParams)
  const router = useRouter()
  const precisaCnpj = PLANOS_COM_CNPJ.includes(plano)
  const [loading, setLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [cepEmpresaLoading, setCepEmpresaLoading] = useState(false)
  const [form, setForm] = useState({
    nome: '', cpf: '', email: '', telefone: '',
    // endereço pessoal
    cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
    // empresa
    cnpj: '', razaoSocial: '',
    cepEmpresa: '', enderecoEmpresa: '', numeroEmpresa: '', complementoEmpresa: '', bairroEmpresa: '', cidadeEmpresa: '', estadoEmpresa: '',
  })
  const [erros, setErros] = useState<Record<string, string>>({})

  const autoSavePayload = useMemo(() => JSON.stringify({
    dadosJson: {
      'Nome completo':   form.nome,
      'CPF':             form.cpf,
      'E-mail':          form.email,
      'Telefone':        form.telefone,
      ...(form.cep         && { 'CEP':          form.cep }),
      ...(form.logradouro  && { 'Logradouro':   form.logradouro }),
      ...(form.numero      && { 'Número':        form.numero }),
      ...(form.complemento && { 'Complemento':  form.complemento }),
      ...(form.bairro      && { 'Bairro':        form.bairro }),
      ...(form.cidade      && { 'Cidade':        form.cidade }),
      ...(form.estado      && { 'Estado':        form.estado }),
      ...(form.cnpj        && { 'CNPJ':          form.cnpj }),
      ...(form.razaoSocial && { 'Razão Social':  form.razaoSocial }),
      ...(form.cepEmpresa          && { 'CEP Empresa':          form.cepEmpresa }),
      ...(form.enderecoEmpresa     && { 'Endereço Empresa':     form.enderecoEmpresa }),
      ...(form.numeroEmpresa       && { 'Número Empresa':       form.numeroEmpresa }),
      ...(form.complementoEmpresa  && { 'Complemento Empresa':  form.complementoEmpresa }),
      ...(form.bairroEmpresa       && { 'Bairro Empresa':       form.bairroEmpresa }),
      ...(form.cidadeEmpresa       && { 'Cidade Empresa':       form.cidadeEmpresa }),
      ...(form.estadoEmpresa       && { 'Estado Empresa':       form.estadoEmpresa }),
    },
  }), [form])

  const saveStatus = useAutoSave(leadId, autoSavePayload)

  useEffect(() => {
    if (!leadId) return
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json())
      .then((lead: { contatoEntrada?: string; dadosJson?: Record<string, string> }) => {
        const d = lead.dadosJson
        if (d && Object.keys(d).length > 0) {
          setForm(f => ({
            ...f,
            nome:               d['Nome completo']          ?? f.nome,
            cpf:                d['CPF']                    ?? f.cpf,
            email:              d['E-mail']                 ?? f.email,
            telefone:           d['Telefone']               ?? f.telefone,
            cep:                d['CEP']                    ?? f.cep,
            logradouro:         d['Logradouro']             ?? f.logradouro,
            numero:             d['Número']                 ?? f.numero,
            complemento:        d['Complemento']            ?? f.complemento,
            bairro:             d['Bairro']                 ?? f.bairro,
            cidade:             d['Cidade']                 ?? f.cidade,
            estado:             d['Estado']                 ?? f.estado,
            cnpj:               d['CNPJ']                   ?? f.cnpj,
            razaoSocial:        d['Razão Social']           ?? f.razaoSocial,
            cepEmpresa:         d['CEP Empresa']            ?? f.cepEmpresa,
            enderecoEmpresa:    d['Endereço Empresa']       ?? f.enderecoEmpresa,
            numeroEmpresa:      d['Número Empresa']         ?? f.numeroEmpresa,
            complementoEmpresa: d['Complemento Empresa']    ?? f.complementoEmpresa,
            bairroEmpresa:      d['Bairro Empresa']         ?? f.bairroEmpresa,
            cidadeEmpresa:      d['Cidade Empresa']         ?? f.cidadeEmpresa,
            estadoEmpresa:      d['Estado Empresa']         ?? f.estadoEmpresa,
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

  async function buscarCEP(cep: string, prefix: '' | 'Empresa') {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    const setter = prefix === 'Empresa' ? setCepEmpresaLoading : setCepLoading
    setter(true)
    try {
      const res = await fetch(`/api/validacoes/cep/${digits}`)
      if (!res.ok) return
      const data = await res.json() as { logradouro?: string; bairro?: string; cidade?: string; uf?: string; erro?: boolean }
      if (data.erro) return
      if (prefix === 'Empresa') {
        setForm(f => ({
          ...f,
          enderecoEmpresa: data.logradouro ?? f.enderecoEmpresa,
          bairroEmpresa:   data.bairro     ?? f.bairroEmpresa,
          cidadeEmpresa:   data.cidade     ?? f.cidadeEmpresa,
          estadoEmpresa:   data.uf         ?? f.estadoEmpresa,
        }))
      } else {
        setForm(f => ({
          ...f,
          logradouro: data.logradouro ?? f.logradouro,
          bairro:     data.bairro     ?? f.bairro,
          cidade:     data.cidade     ?? f.cidade,
          estado:     data.uf         ?? f.estado,
        }))
      }
    } catch { /* ignora */ } finally {
      setter(false)
    }
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
      await fetch('/api/onboarding/salvar-progresso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          status: 'dados_preenchidos',
          stepAtual: 4,
          dadosJson: {
            'Nome completo':   form.nome,
            'CPF':             form.cpf,
            'E-mail':          form.email,
            'Telefone':        form.telefone,
            ...(form.cep         && { 'CEP':          form.cep }),
            ...(form.logradouro  && { 'Logradouro':   form.logradouro }),
            ...(form.numero      && { 'Número':        form.numero }),
            ...(form.complemento && { 'Complemento':  form.complemento }),
            ...(form.bairro      && { 'Bairro':        form.bairro }),
            ...(form.cidade      && { 'Cidade':        form.cidade }),
            ...(form.estado      && { 'Estado':        form.estado }),
            ...(form.cnpj        && { 'CNPJ':          form.cnpj }),
            ...(form.razaoSocial && { 'Razão Social':  form.razaoSocial }),
            ...(form.cepEmpresa          && { 'CEP Empresa':          form.cepEmpresa }),
            ...(form.enderecoEmpresa     && { 'Endereço Empresa':     form.enderecoEmpresa }),
            ...(form.numeroEmpresa       && { 'Número Empresa':       form.numeroEmpresa }),
            ...(form.complementoEmpresa  && { 'Complemento Empresa':  form.complementoEmpresa }),
            ...(form.bairroEmpresa       && { 'Bairro Empresa':       form.bairroEmpresa }),
            ...(form.cidadeEmpresa       && { 'Cidade Empresa':       form.cidadeEmpresa }),
            ...(form.estadoEmpresa       && { 'Estado Empresa':       form.estadoEmpresa }),
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

        {/* Endereço pessoal */}
        <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-4">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Endereço <span className="normal-case font-normal text-on-surface-variant/60">(opcional)</span>
          </p>

          <div>
            <label className={LABEL}>CEP</label>
            <div className="relative">
              <input
                className={INPUT}
                placeholder="00000-000"
                value={form.cep}
                onChange={e => {
                  const v = formatCEP(e.target.value)
                  set('cep', v)
                  if (v.replace(/\D/g, '').length === 8) buscarCEP(v, '')
                }}
                inputMode="numeric"
                maxLength={9}
              />
              {cepLoading && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              )}
            </div>
          </div>

          <div>
            <label className={LABEL}>Logradouro</label>
            <input className={INPUT} placeholder="Rua, Av., Travessa..." value={form.logradouro} onChange={e => set('logradouro', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Número</label>
              <input className={INPUT} placeholder="123" value={form.numero} onChange={e => set('numero', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Complemento</label>
              <input className={INPUT} placeholder="Apto, sala..." value={form.complemento} onChange={e => set('complemento', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Bairro</label>
            <input className={INPUT} placeholder="Bairro" value={form.bairro} onChange={e => set('bairro', e.target.value)} />
          </div>

          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div>
              <label className={LABEL}>Cidade</label>
              <input className={INPUT} placeholder="Fortaleza" value={form.cidade} onChange={e => set('cidade', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>UF</label>
              <input className={INPUT} placeholder="CE" value={form.estado} onChange={e => set('estado', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
            </div>
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
            <label className={LABEL}>CEP da empresa</label>
            <div className="relative">
              <input
                className={INPUT}
                placeholder="00000-000"
                value={form.cepEmpresa}
                onChange={e => {
                  const v = formatCEP(e.target.value)
                  set('cepEmpresa', v)
                  if (v.replace(/\D/g, '').length === 8) buscarCEP(v, 'Empresa')
                }}
                inputMode="numeric"
                maxLength={9}
              />
              {cepEmpresaLoading && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              )}
            </div>
          </div>

          <div>
            <label className={LABEL}>Endereço da empresa</label>
            <input className={INPUT} placeholder="Rua, Av., Travessa..." value={form.enderecoEmpresa} onChange={e => set('enderecoEmpresa', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Número</label>
              <input className={INPUT} placeholder="123" value={form.numeroEmpresa} onChange={e => set('numeroEmpresa', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Complemento</label>
              <input className={INPUT} placeholder="Sala, andar..." value={form.complementoEmpresa} onChange={e => set('complementoEmpresa', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Bairro</label>
            <input className={INPUT} placeholder="Bairro" value={form.bairroEmpresa} onChange={e => set('bairroEmpresa', e.target.value)} />
          </div>

          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div>
              <label className={LABEL}>Cidade</label>
              <input className={INPUT} placeholder="Fortaleza" value={form.cidadeEmpresa} onChange={e => set('cidadeEmpresa', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>UF</label>
              <input className={INPUT} placeholder="CE" value={form.estadoEmpresa} onChange={e => set('estadoEmpresa', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
            </div>
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
