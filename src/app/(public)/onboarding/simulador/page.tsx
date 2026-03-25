'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = { searchParams: Promise<{ leadId?: string }> }

const TIPO_EMPRESA = [
  { value: 'mei', label: 'MEI', desc: 'Microempreendedor individual', icon: 'person' },
  { value: 'me_epp', label: 'ME / EPP', desc: 'Micro ou pequena empresa', icon: 'storefront' },
  { value: 'ltda_sa', label: 'Ltda / S/A', desc: 'Médias e grandes empresas', icon: 'domain' },
  { value: 'liberal', label: 'Prof. liberal', desc: 'Médico, advogado, dentista...', icon: 'badge' },
  { value: 'nao_abri', label: 'Ainda não abri', desc: 'Quero abrir minha empresa', icon: 'rocket_launch' },
]

const FATURAMENTO = [
  { value: 'ate10k', label: 'Até R$ 10 mil', desc: 'por mês' },
  { value: '10k_50k', label: 'R$ 10k – 50k', desc: 'por mês' },
  { value: '50k_200k', label: 'R$ 50k – 200k', desc: 'por mês' },
  { value: 'acima200k', label: 'Acima de R$ 200k', desc: 'por mês' },
]

const FUNCIONARIOS = [
  { value: 'nao', label: 'Não tenho', icon: 'person_off' },
  { value: '1_3', label: '1 a 3', icon: 'group' },
  { value: '4_10', label: '4 a 10', icon: 'groups' },
  { value: 'mais10', label: 'Mais de 10', icon: 'corporate_fare' },
]

function OptionCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border p-4 text-left transition-all ${
        selected
          ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
          : 'border-outline-variant/20 bg-white hover:border-outline-variant/40 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  )
}

export default function SimuladorPage({ searchParams }: Props) {
  const { leadId } = use(searchParams)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ tipo: '', faturamento: '', funcionarios: '' })

  const canContinue = form.tipo && form.faturamento && form.funcionarios

  async function handleSubmit() {
    if (!leadId || !canContinue) return
    setLoading(true)
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'simulador',
          stepAtual: 2,
          dadosJson: { simulador: form },
        }),
      })
      const params = new URLSearchParams({
        leadId,
        tipo: form.tipo,
        faturamento: form.faturamento,
        funcionarios: form.funcionarios,
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

      {/* Tipo de empresa */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-3">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
          1. Como é sua empresa?
        </p>
        <div className="space-y-2">
          {TIPO_EMPRESA.map(op => (
            <OptionCard key={op.value} selected={form.tipo === op.value} onClick={() => setForm(f => ({ ...f, tipo: op.value }))}>
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${form.tipo === op.value ? 'bg-primary/15' : 'bg-slate-100'}`}>
                  <span className={`material-symbols-outlined text-[18px] ${form.tipo === op.value ? 'text-primary' : 'text-on-surface-variant'}`}>{op.icon}</span>
                </div>
                <div>
                  <p className={`text-[14px] font-semibold ${form.tipo === op.value ? 'text-primary' : 'text-on-surface'}`}>{op.label}</p>
                  <p className="text-[12px] text-on-surface-variant">{op.desc}</p>
                </div>
                {form.tipo === op.value && (
                  <span className="material-symbols-outlined ml-auto text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                )}
              </div>
            </OptionCard>
          ))}
        </div>
      </div>

      {/* Faturamento */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-3">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
          2. Faturamento mensal estimado
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FATURAMENTO.map(op => (
            <button
              key={op.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, faturamento: op.value }))}
              className={`rounded-2xl border p-3.5 text-left transition-all ${
                form.faturamento === op.value
                  ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                  : 'border-outline-variant/20 bg-white hover:border-outline-variant/40'
              }`}
            >
              <p className={`text-[14px] font-semibold ${form.faturamento === op.value ? 'text-primary' : 'text-on-surface'}`}>{op.label}</p>
              <p className="text-[11px] text-on-surface-variant">{op.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Funcionários */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm space-y-3">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
          3. Funcionários registrados
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FUNCIONARIOS.map(op => (
            <button
              key={op.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, funcionarios: op.value }))}
              className={`flex items-center gap-2.5 rounded-2xl border p-3.5 transition-all ${
                form.funcionarios === op.value
                  ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                  : 'border-outline-variant/20 bg-white hover:border-outline-variant/40'
              }`}
            >
              <span className={`material-symbols-outlined text-[20px] ${form.funcionarios === op.value ? 'text-primary' : 'text-on-surface-variant'}`}>{op.icon}</span>
              <span className={`text-[14px] font-semibold ${form.funcionarios === op.value ? 'text-primary' : 'text-on-surface'}`}>{op.label}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canContinue || loading}
        className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-40"
      >
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <>Ver meu plano recomendado <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
        )}
      </button>
    </div>
  )
}
