'use client'

import { useState, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = { searchParams: Promise<{ leadId?: string; tipo?: string; faturamento?: string; funcionarios?: string }> }

type PlanoTipo = 'essencial' | 'profissional' | 'empresarial' | 'startup'

const PLANOS: { tipo: PlanoTipo; nome: string; desc: string; min: number; max: number; icon: string; servicos: string[] }[] = [
  {
    tipo: 'essencial',
    nome: 'Essencial',
    desc: 'Ideal para MEI e microempresas',
    min: 179, max: 299,
    icon: 'rocket_launch',
    servicos: ['Obrigações fiscais acessórias', 'Geração de DAS automática', 'Portal básico do cliente', 'Chatbot de dúvidas 24h', 'Alertas de prazo por WhatsApp'],
  },
  {
    tipo: 'profissional',
    nome: 'Profissional',
    desc: 'Para empresas do Simples Nacional',
    min: 449, max: 699,
    icon: 'trending_up',
    servicos: ['Tudo do Essencial', 'Depto. pessoal (até 3 funcionários)', 'DRE simplificado mensal', 'Fluxo de caixa', 'Relatório narrativo com IA'],
  },
  {
    tipo: 'empresarial',
    nome: 'Empresarial',
    desc: 'Para Lucro Presumido e Real',
    min: 990, max: 1800,
    icon: 'domain',
    servicos: ['Tudo do Profissional', 'Depto. pessoal ilimitado', 'KPIs avançados e dashboards', 'Consultoria mensal de 1h', 'Simulação de cenários tributários'],
  },
  {
    tipo: 'startup',
    nome: 'Startup',
    desc: 'Para empresas digitais em crescimento',
    min: 1200, max: 2500,
    icon: 'bolt',
    servicos: ['Tudo do Empresarial', 'Relatórios para investidores', 'Benchmark setorial com IA', 'Suporte prioritário', 'Planejamento tributário estratégico'],
  },
]

function recomendar(tipo: string, faturamento: string, funcionarios: string): PlanoTipo {
  const scoreTipo:        Record<string, number> = { nao_abri: 0, mei: 0, liberal: 1, me_epp: 1, ltda_sa: 2 }
  const scoreFaturamento: Record<string, number> = { ate10k: 0, '10k_50k': 1, '50k_200k': 2, acima200k: 3 }
  const scoreFuncionarios:Record<string, number> = { nao: 0, '1_3': 1, '4_10': 2, mais10: 3 }

  const score = (scoreTipo[tipo] ?? 0) + (scoreFaturamento[faturamento] ?? 0) + (scoreFuncionarios[funcionarios] ?? 0)

  if (score <= 1) return 'essencial'
  if (score <= 3) return 'profissional'
  if (score <= 5) return 'empresarial'
  return 'startup'
}

export default function PlanoPage({ searchParams }: Props) {
  const { leadId, tipo = '', faturamento = '', funcionarios = '' } = use(searchParams)
  const router = useRouter()
  const recomendado = recomendar(tipo, faturamento, funcionarios)
  const [selecionado, setSelecionado] = useState<PlanoTipo>(recomendado)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!leadId) return
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json())
      .then((lead: { planoTipo?: PlanoTipo }) => {
        if (lead.planoTipo) setSelecionado(lead.planoTipo)
      })
      .catch(() => {})
  }, [leadId])

  async function handleEscolher() {
    if (!leadId) return
    setLoading(true)
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planoTipo: selecionado, status: 'plano_escolhido', stepAtual: 3 }),
      })
      router.push(`/onboarding/dados?leadId=${leadId}&plano=${selecionado}`)
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center pt-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-status/10">
          <span className="material-symbols-outlined text-[28px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>
            recommend
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Seu plano ideal</h1>
        <p className="mt-1.5 text-[14px] text-on-surface-variant">
          Recomendamos o <span className="font-semibold text-primary">{PLANOS.find(p => p.tipo === recomendado)?.nome}</span>
          {' '}— mas você pode escolher outro abaixo.
        </p>
      </div>

      <div className="space-y-3">
        {PLANOS.map(plano => {
          const isRec = plano.tipo === recomendado
          const isSel = plano.tipo === selecionado
          return (
            <button
              key={plano.tipo}
              type="button"
              onClick={() => setSelecionado(plano.tipo)}
              className={`w-full rounded-2xl border p-4 text-left transition-all ${
                isSel
                  ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                  : 'border-outline-variant/25 bg-card hover:border-primary/30 hover:bg-primary/[0.02]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isSel ? 'bg-primary/15' : 'bg-slate-100'}`}>
                  <span className={`material-symbols-outlined text-[20px] ${isSel ? 'text-primary' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                    {plano.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[15px] font-semibold ${isSel ? 'text-primary' : 'text-on-surface'}`}>{plano.nome}</span>
                    {isRec && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-on-surface-variant">{plano.desc}</p>
                  <p className={`mt-1.5 text-[14px] font-semibold ${isSel ? 'text-primary' : 'text-on-surface'}`}>
                    R$ {plano.min.toLocaleString('pt-BR')} – {plano.max.toLocaleString('pt-BR')}<span className="text-[12px] font-normal text-on-surface-variant">/mês</span>
                  </p>
                </div>
                <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${isSel ? 'border-primary bg-primary' : 'border-outline-variant/60 bg-surface-container'}`}>
                  {isSel && <span className="material-symbols-outlined text-[13px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>}
                </div>
              </div>

              {/* Features */}
              {isSel && (
                <ul className="mt-3 space-y-1.5 border-t border-primary/10 pt-3">
                  {plano.servicos.map(s => (
                    <li key={s} className="flex items-center gap-2 text-[12px] text-on-surface-variant">
                      <span className="material-symbols-outlined text-[14px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          )
        })}
      </div>

      <button
        onClick={handleEscolher}
        disabled={loading}
        className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <>Continuar com {PLANOS.find(p => p.tipo === selecionado)?.nome} <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
        )}
      </button>
    </div>
  )
}
