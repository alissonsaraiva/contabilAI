'use client'

import { useState, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatCNPJ } from '@/lib/utils'
import { useCnpj } from '@/hooks/use-cnpj'
import type { DadosCNPJ } from '@/hooks/use-cnpj'

type Props = { searchParams: Promise<{ leadId?: string }> }

const INPUT = 'w-full h-12 rounded-2xl border border-outline-variant/30 bg-white px-4 text-[15px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'

const FATURAMENTO = [
  { value: 'ate10k',    label: 'Até R$ 10 mil',       desc: 'por mês' },
  { value: '10k_50k',   label: 'R$ 10k – 50k',         desc: 'por mês' },
  { value: '50k_200k',  label: 'R$ 50k – 200k',        desc: 'por mês' },
  { value: 'acima200k', label: 'Acima de R$ 200k',     desc: 'por mês' },
]

const FUNCIONARIOS = [
  { value: 'nao',    label: 'Não tenho',    icon: 'person_off' },
  { value: '1_3',    label: '1 a 3',        icon: 'group' },
  { value: '4_10',   label: '4 a 10',       icon: 'groups' },
  { value: 'mais10', label: 'Mais de 10',   icon: 'corporate_fare' },
]


const REGIME_LABEL: Record<string, string> = {
  MEI:            'MEI — Microempreendedor Individual',
  SimplesNacional: 'Simples Nacional',
  outro:          'Lucro Presumido / Real',
}

function regimeParaTipo(regime: DadosCNPJ['regime']): string {
  if (regime === 'MEI') return 'mei'
  if (regime === 'SimplesNacional') return 'me_epp'
  return 'ltda_sa'
}

export default function SimuladorPage({ searchParams }: Props) {
  const { leadId } = use(searchParams)
  const router = useRouter()
  const [tipoConta, setTipoConta] = useState<'pj' | 'pf' | 'abertura' | ''>('')
  const [cnpj, setCnpj] = useState('')
  const [cnpjDados, setCnpjDados] = useState<DadosCNPJ | null>(null)
  const [faturamento, setFaturamento] = useState('')
  const [funcionarios, setFuncionarios] = useState('nao')
  const [loading, setLoading] = useState(false)
  const { buscarCnpj, loading: cnpjLoading } = useCnpj()

  // Restaura dados do lead ao retornar para este passo
  useEffect(() => {
    if (!leadId) return
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json())
      .then((lead: { dadosJson?: Record<string, unknown> }) => {
        const d = lead.dadosJson
        if (!d) return
        const sim = d.simulador as { tipo?: string; faturamento?: string; funcionarios?: string } | undefined
        const cnpjSalvo = d['CNPJ'] as string | undefined

        if (cnpjSalvo) {
          setTipoConta('pj')
          setCnpj(cnpjSalvo)
        } else if (sim?.tipo === 'liberal') {
          setTipoConta('pf')
        } else if (sim?.tipo === 'nao_abri' || sim?.tipo === 'abertura') {
          setTipoConta('abertura')
        }
        if (sim?.faturamento) setFaturamento(sim.faturamento)
        if (sim?.funcionarios) setFuncionarios(sim.funcionarios)
      })
      .catch(() => {})
  }, [leadId])

  // Auto-lookup quando CNPJ é restaurado do banco (14 dígitos, sem dados ainda)
  useEffect(() => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length === 14 && !cnpjDados) {
      buscarCnpj(digits).then(d => { if (d) setCnpjDados(d) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj])

  async function handleCnpjChange(value: string) {
    setCnpj(value)
    const digits = value.replace(/\D/g, '')
    if (digits.length === 14) {
      const dados = await buscarCnpj(digits)
      if (dados) {
        setCnpjDados(dados)
        if (dados.situacao !== 'ATIVA') {
          toast.warning(`CNPJ com situação "${dados.situacao}". Verifique com a Receita Federal antes de prosseguir.`)
        }
      } else {
        setCnpjDados(null)
      }
    } else {
      setCnpjDados(null)
    }
  }

  const tipoDerived = cnpjDados ? regimeParaTipo(cnpjDados.regime) : 'me_epp'

  const canContinue = tipoConta === 'pj'
    ? cnpj.replace(/\D/g, '').length === 14 && !!faturamento && !!funcionarios
    : (tipoConta === 'pf' || tipoConta === 'abertura')
      ? !!faturamento && !!funcionarios
      : false

  async function handleSubmit() {
    if (!leadId || !canContinue) return
    setLoading(true)
    try {
      const tipo = tipoConta === 'pj' ? tipoDerived : tipoConta === 'abertura' ? 'abertura' : 'liberal'
      const dadosJson: Record<string, unknown> = {
        simulador: { tipo, faturamento, funcionarios },
      }

      if (tipoConta === 'pj') {
        dadosJson['CNPJ'] = cnpj
        if (cnpjDados) {
          dadosJson['Razão Social'] = cnpjDados.razaoSocial
          if (cnpjDados.nomeFantasia) dadosJson['Nome Fantasia'] = cnpjDados.nomeFantasia
          if (cnpjDados.regime !== 'outro') dadosJson['Regime'] = cnpjDados.regime
          if (cnpjDados.logradouro) dadosJson['Endereço Empresa'] = cnpjDados.logradouro
          if (cnpjDados.numero)     dadosJson['Número Empresa']   = cnpjDados.numero
          if (cnpjDados.complemento) dadosJson['Complemento Empresa'] = cnpjDados.complemento
          if (cnpjDados.bairro)     dadosJson['Bairro Empresa']   = cnpjDados.bairro
          if (cnpjDados.municipio)  dadosJson['Cidade Empresa']   = cnpjDados.municipio
          if (cnpjDados.uf)         dadosJson['Estado Empresa']   = cnpjDados.uf
          if (cnpjDados.cep) {
            const c = cnpjDados.cep
            dadosJson['CEP Empresa'] = c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c
          }
        }
      }

      await fetch('/api/onboarding/salvar-progresso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status: 'simulador', stepAtual: 2, dadosJson }),
      })

      const params = new URLSearchParams({
        leadId,
        tipo,
        faturamento,
        funcionarios,
        ...(cnpjDados?.regime && { regime: cnpjDados.regime }),
      })
      router.push(`/onboarding/plano?${params}`)
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
            analytics
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Conte sobre seu negócio</h1>
        <p className="mt-1.5 text-[14px] text-on-surface-variant">
          Vamos recomendar o plano ideal para você
        </p>
      </div>

      {/* Toggle PJ / PF */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-3">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
          1. Como você trabalha?
        </p>
        <div className="space-y-2">
          {([
            { value: 'pj',       icon: 'domain',         label: 'Tenho empresa com CNPJ',     desc: 'MEI, ME, EPP, Ltda, S/A...' },
            { value: 'pf',       icon: 'badge',          label: 'Sou autônomo / Prof. liberal', desc: 'Trabalho com CPF, sem empresa aberta' },
            { value: 'abertura', icon: 'rocket_launch',  label: 'Desejo abrir uma empresa',   desc: 'Quero abrir meu CNPJ e preciso de orientação' },
          ] as const).map(op => (
            <button
              key={op.value}
              type="button"
              onClick={() => {
                setTipoConta(op.value)
                setCnpjDados(null)
              }}
              className={`w-full rounded-2xl border p-4 text-left transition-all ${
                tipoConta === op.value
                  ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                  : 'border-outline-variant/20 bg-white hover:border-outline-variant/40 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${tipoConta === op.value ? 'bg-primary/15' : 'bg-slate-100'}`}>
                  <span className={`material-symbols-outlined text-[18px] ${tipoConta === op.value ? 'text-primary' : 'text-on-surface-variant'}`}>{op.icon}</span>
                </div>
                <div>
                  <p className={`text-[14px] font-semibold ${tipoConta === op.value ? 'text-primary' : 'text-on-surface'}`}>{op.label}</p>
                  <p className="text-[12px] text-on-surface-variant">{op.desc}</p>
                </div>
                {tipoConta === op.value && (
                  <span className="material-symbols-outlined ml-auto text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Fluxo PJ ─────────────────────────────────────────────────────────── */}
      {tipoConta === 'pj' && (
        <>
          {/* CNPJ */}
          <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-3">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
              2. CNPJ da empresa
            </p>
            <div className="relative">
              <input
                className={INPUT}
                placeholder="00.000.000/0001-00"
                value={cnpj}
                onChange={e => handleCnpjChange(formatCNPJ(e.target.value))}
                inputMode="numeric"
                maxLength={18}
              />
              {cnpjLoading && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              )}
            </div>

            {/* Card da empresa após lookup */}
            {cnpjDados && (
              <div className={`rounded-2xl border p-4 space-y-2 ${
                cnpjDados.situacao === 'ATIVA'
                  ? 'border-green-status/20 bg-green-status/5'
                  : 'border-yellow-500/30 bg-yellow-50'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold text-on-surface">{cnpjDados.razaoSocial}</p>
                    {cnpjDados.nomeFantasia && cnpjDados.nomeFantasia !== cnpjDados.razaoSocial && (
                      <p className="text-[12px] text-on-surface-variant">{cnpjDados.nomeFantasia}</p>
                    )}
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    cnpjDados.situacao === 'ATIVA'
                      ? 'bg-green-status/15 text-green-status'
                      : 'bg-yellow-500/15 text-yellow-700'
                  }`}>
                    <span className="material-symbols-outlined text-[10px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {cnpjDados.situacao === 'ATIVA' ? 'check_circle' : 'warning'}
                    </span>
                    {cnpjDados.situacao}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    <span className="material-symbols-outlined text-[12px]">receipt_long</span>
                    {REGIME_LABEL[cnpjDados.regime] ?? cnpjDados.regime}
                  </span>
                  {cnpjDados.municipio && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-[11px] text-on-surface-variant">
                      <span className="material-symbols-outlined text-[12px]">location_on</span>
                      {cnpjDados.municipio}/{cnpjDados.uf}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-on-surface-variant/70">
                  Dados preenchidos automaticamente via Receita Federal — você pode revisar no próximo passo.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Faturamento (todos os fluxos) ────────────────────────────────────── */}
      {tipoConta && (
        <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-3">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {tipoConta === 'pj' ? '3' : '2'}. Faturamento mensal estimado
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FATURAMENTO.map(op => (
              <button
                key={op.value}
                type="button"
                onClick={() => setFaturamento(op.value)}
                className={`rounded-2xl border p-3.5 text-left transition-all ${
                  faturamento === op.value
                    ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                    : 'border-outline-variant/20 bg-white hover:border-outline-variant/40'
                }`}
              >
                <p className={`text-[14px] font-semibold ${faturamento === op.value ? 'text-primary' : 'text-on-surface'}`}>{op.label}</p>
                <p className="text-[11px] text-on-surface-variant">{op.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Funcionários (ambos os fluxos) ───────────────────────────────────── */}
      {tipoConta && (
        <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-3">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {tipoConta === 'pj' ? '4' : '3'}. Funcionários registrados
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FUNCIONARIOS.map(op => (
              <button
                key={op.value}
                type="button"
                onClick={() => setFuncionarios(op.value)}
                className={`flex items-center gap-2.5 rounded-2xl border p-3.5 transition-all ${
                  funcionarios === op.value
                    ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                    : 'border-outline-variant/20 bg-white hover:border-outline-variant/40'
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] ${funcionarios === op.value ? 'text-primary' : 'text-on-surface-variant'}`}>{op.icon}</span>
                <span className={`text-[14px] font-semibold ${funcionarios === op.value ? 'text-primary' : 'text-on-surface'}`}>{op.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push(leadId ? `/onboarding?leadId=${leadId}` : '/onboarding')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/30 bg-white text-on-surface-variant hover:bg-surface-container transition-colors"
          aria-label="Voltar"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canContinue || loading}
          className="flex flex-1 h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>Ver meu plano recomendado <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
          )}
        </button>
      </div>
    </div>
  )
}
