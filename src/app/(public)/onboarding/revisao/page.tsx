'use client'

import { useState, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = { searchParams: Promise<{ leadId?: string; plano?: string }> }

type PlanoInfo = { tipo: string; nome: string; valorMinimo: number; valorMaximo: number }
type EscritorioConfig = { vencimentosDias?: number[] | null; pixDescontoPercent?: number | null }

const PLANO_LABELS_FALLBACK: Record<string, string> = {
  essencial: 'Essencial', profissional: 'Profissional',
  empresarial: 'Empresarial', startup: 'Startup',
}

const VENCIMENTOS_FALLBACK = [5, 10, 15, 20]

const FORMAS_PAGAMENTO = [
  { value: 'pix',    label: 'PIX',    icon: 'qr_code_2',    descFn: (d: number) => `Desconto de ${d}%` },
  { value: 'boleto', label: 'Boleto', icon: 'receipt_long', descFn: () => 'Vencimento mensal' },
  { value: 'cartao', label: 'Cartão', icon: 'credit_card',  descFn: () => 'Crédito ou débito' },
]

export default function RevisaoPage({ searchParams }: Props) {
  const { leadId, plano = 'profissional' } = use(searchParams)
  const router = useRouter()
  const [vencimento, setVencimento] = useState<number>(10)
  const [formaPagamento, setFormaPagamento] = useState('pix')
  const [loading, setLoading] = useState(false)
  const [planos, setPlanos] = useState<PlanoInfo[]>([])
  const [config, setConfig] = useState<EscritorioConfig>({ vencimentosDias: VENCIMENTOS_FALLBACK, pixDescontoPercent: 5.0 })

  useEffect(() => {
    fetch('/api/planos')
      .then(r => r.json())
      .then((data: PlanoInfo[]) => { if (Array.isArray(data) && data.length > 0) setPlanos(data) })
      .catch(err => console.error('[onboarding] falha ao salvar progresso:', err))

    fetch('/api/escritorio')
      .then(r => r.json())
      .then((e: EscritorioConfig) => {
        setConfig({
          vencimentosDias: Array.isArray(e?.vencimentosDias) && e.vencimentosDias.length > 0
            ? e.vencimentosDias
            : VENCIMENTOS_FALLBACK,
          pixDescontoPercent: e?.pixDescontoPercent ?? 5.0,
        })
      })
      .catch(err => console.error('[onboarding] falha ao salvar progresso:', err))
  }, [])

  useEffect(() => {
    if (!leadId) return
    fetch(`/api/onboarding/lead/${leadId}`)
      .then(r => r.json())
      .then((lead: { vencimentoDia?: number; formaPagamento?: string }) => {
        if (lead.vencimentoDia) setVencimento(lead.vencimentoDia)
        if (lead.formaPagamento) setFormaPagamento(lead.formaPagamento)
      })
      .catch(err => console.error('[onboarding] falha ao salvar progresso:', err))
  }, [leadId])

  async function handleConcluir() {
    if (!leadId) return
    setLoading(true)
    try {
      await fetch('/api/onboarding/salvar-progresso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          status: 'revisao',
          stepAtual: 5,
          vencimentoDia: vencimento,
          formaPagamento,
        }),
      })
      router.push(`/onboarding/contrato?leadId=${leadId}&plano=${plano}`)
    } catch {
      toast.error('Erro ao salvar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const planoInfo = planos.find(p => p.tipo === plano)
  const planoLabel = planoInfo?.nome ?? PLANO_LABELS_FALLBACK[plano] ?? plano
  const planoValores = planoInfo
    ? `R$ ${Number(planoInfo.valorMinimo).toLocaleString('pt-BR')} – ${Number(planoInfo.valorMaximo).toLocaleString('pt-BR')}/mês`
    : null

  const vencimentos = config.vencimentosDias ?? VENCIMENTOS_FALLBACK
  const pixDesconto = config.pixDescontoPercent ?? 5.0

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center pt-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <span className="material-symbols-outlined text-[28px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            fact_check
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Quase lá!</h1>
        <p className="mt-1.5 text-[14px] text-on-surface-variant">
          Revise e escolha como prefere pagar
        </p>
      </div>

      {/* Resumo do plano */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm">
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">Plano selecionado</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[17px] font-semibold text-on-surface">{planoLabel}</p>
            {planoValores && <p className="text-[13px] text-on-surface-variant">{planoValores}</p>}
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">
            Selecionado
          </span>
        </div>
        <div className="mt-3 rounded-xl bg-primary/5 border border-primary/10 p-3">
          <p className="text-[12px] text-primary/80 leading-relaxed">
            <span className="font-semibold">Valor final</span> definido após análise pelo nosso contador. A faixa acima é orientativa.
          </p>
        </div>
      </div>

      {/* Dia de vencimento */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm">
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">Dia preferido para pagamento</p>
        <div className="grid grid-cols-4 gap-2">
          {vencimentos.map(dia => (
            <button
              key={dia}
              type="button"
              onClick={() => setVencimento(dia)}
              className={`rounded-2xl border py-3 text-center transition-all ${
                vencimento === dia
                  ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                  : 'border-outline-variant/20 bg-white hover:border-outline-variant/40'
              }`}
            >
              <p className={`text-[18px] font-bold ${vencimento === dia ? 'text-primary' : 'text-on-surface'}`}>
                {dia}
              </p>
              <p className="text-[10px] text-on-surface-variant">todo mês</p>
            </button>
          ))}
        </div>
      </div>

      {/* Forma de pagamento */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm">
        <p className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">Forma de pagamento</p>
        <div className="space-y-2">
          {FORMAS_PAGAMENTO.map(fp => {
            const desc = fp.value === 'pix' ? fp.descFn(pixDesconto) : fp.descFn(0)
            return (
              <button
                key={fp.value}
                type="button"
                onClick={() => setFormaPagamento(fp.value)}
                className={`w-full flex items-center gap-3 rounded-2xl border p-4 transition-all ${
                  formaPagamento === fp.value
                    ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                    : 'border-outline-variant/20 bg-white hover:border-outline-variant/40'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${formaPagamento === fp.value ? 'bg-primary/15' : 'bg-slate-100'}`}>
                  <span className={`material-symbols-outlined text-[20px] ${formaPagamento === fp.value ? 'text-primary' : 'text-on-surface-variant'}`}>{fp.icon}</span>
                </div>
                <div className="flex-1 text-left">
                  <p className={`text-[14px] font-semibold ${formaPagamento === fp.value ? 'text-primary' : 'text-on-surface'}`}>{fp.label}</p>
                  <p className="text-[12px] text-on-surface-variant">{desc}</p>
                </div>
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${formaPagamento === fp.value ? 'border-primary bg-primary' : 'border-outline-variant/40'}`}>
                  {formaPagamento === fp.value && <span className="material-symbols-outlined text-[13px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push(leadId ? `/onboarding/dados?leadId=${leadId}&plano=${plano}` : '/onboarding/dados')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/30 bg-white text-on-surface-variant hover:bg-surface-container transition-colors"
          aria-label="Voltar"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <button
          onClick={handleConcluir}
          disabled={loading}
          className="flex flex-1 h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>Enviar solicitação <span className="material-symbols-outlined text-[18px]">send</span></>
          )}
        </button>
      </div>

      <p className="text-center text-[12px] text-on-surface-variant/60">
        Ao continuar, você concorda com nossos termos de serviço. Sem compromisso.
      </p>
    </div>
  )
}
