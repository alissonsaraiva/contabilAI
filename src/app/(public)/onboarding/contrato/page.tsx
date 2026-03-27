'use client'

import { useState, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = { searchParams: Promise<{ leadId?: string; plano?: string }> }

const PLANO_LABELS_FALLBACK: Record<string, string> = {
  essencial: 'Essencial', profissional: 'Profissional',
  empresarial: 'Empresarial', startup: 'Startup',
}
const PLANO_PRECOS_FALLBACK: Record<string, number> = {
  essencial: 199, profissional: 499, empresarial: 1200, startup: 1500,
}
const FORMA_LABELS: Record<string, string> = {
  pix: 'PIX', boleto: 'Boleto Bancário', cartao: 'Cartão de Crédito/Débito',
}

type LeadData = {
  contatoEntrada: string
  planoTipo: string | null
  vencimentoDia: number | null
  formaPagamento: string | null
  dadosJson: Record<string, string> | null
}
type PlanoInfo = { tipo: string; nome: string; valorMinimo: number }
type EscritorioInfo = {
  nome?: string | null
  multaPercent?: number | null
  jurosMesPercent?: number | null
  diasAtrasoMulta?: number | null
  diasInadimplenciaRescisao?: number | null
  diasAvisoRescisao?: number | null
}

export default function ContratoPage({ searchParams }: Props) {
  const { leadId, plano = 'essencial' } = use(searchParams)
  const router = useRouter()
  const [lead, setLead] = useState<LeadData | null>(null)
  const [aceito, setAceito] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingLead, setLoadingLead] = useState(true)
  const [planos, setPlanos] = useState<PlanoInfo[]>([])
  const [escritorio, setEscritorio] = useState<EscritorioInfo>({})

  useEffect(() => {
    fetch('/api/planos')
      .then(r => r.json())
      .then((data: PlanoInfo[]) => { if (Array.isArray(data) && data.length > 0) setPlanos(data) })
      .catch(() => {})

    fetch('/api/escritorio')
      .then(r => r.json())
      .then((e: EscritorioInfo) => { if (e) setEscritorio(e) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!leadId) return
    fetch(`/api/leads/${leadId}`)
      .then(r => r.json())
      .then((data: LeadData) => setLead(data))
      .catch(() => toast.error('Erro ao carregar dados.'))
      .finally(() => setLoadingLead(false))
  }, [leadId])

  async function handleEnviar() {
    if (!aceito) { toast.error('Confirme que leu e concorda com os termos.'); return }
    if (!leadId) return

    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/contrato/enviar`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao enviar contrato. Tente novamente.')
        return
      }
      router.push(`/onboarding/confirmacao?leadId=${leadId}&aguardando=true`)
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const planoFinal = lead?.planoTipo ?? plano
  const planoInfo = planos.find(p => p.tipo === planoFinal)
  const planoLabel = planoInfo?.nome ?? PLANO_LABELS_FALLBACK[planoFinal] ?? planoFinal
  const valor = planoInfo ? Number(planoInfo.valorMinimo) : (PLANO_PRECOS_FALLBACK[planoFinal] ?? 199)
  const vencimento = lead?.vencimentoDia ?? 10
  const forma = lead?.formaPagamento ?? 'pix'
  const dados = lead?.dadosJson
  const nome = dados?.['Nome completo'] ?? lead?.contatoEntrada ?? ''
  const cpf = dados?.['CPF'] ?? ''

  const nomeEscritorio = escritorio?.nome ?? 'Escritório Contábil'
  const multa    = escritorio?.multaPercent              ?? 2.0
  const juros    = escritorio?.jurosMesPercent           ?? 1.0
  const diasMul  = escritorio?.diasAtrasoMulta           ?? 15
  const diasInad = escritorio?.diasInadimplenciaRescisao ?? 60
  const diasResc = escritorio?.diasAvisoRescisao         ?? 30

  if (loadingLead) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="text-center pt-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <span className="material-symbols-outlined text-[28px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            contract
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Seu contrato</h1>
        <p className="mt-1.5 text-[14px] text-on-surface-variant">
          Leia com atenção e envie para assinatura eletrônica
        </p>
      </div>

      {/* Resumo do plano */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/70 mb-2">Resumo da contratação</p>
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <div>
            <p className="text-on-surface-variant/60">Plano</p>
            <p className="font-semibold text-on-surface">{planoLabel}</p>
          </div>
          <div>
            <p className="text-on-surface-variant/60">Valor mensal</p>
            <p className="font-semibold text-primary">R$ {valor.toLocaleString('pt-BR')}/mês</p>
          </div>
          <div>
            <p className="text-on-surface-variant/60">Vencimento</p>
            <p className="font-semibold text-on-surface">Todo dia {vencimento}</p>
          </div>
          <div>
            <p className="text-on-surface-variant/60">Pagamento</p>
            <p className="font-semibold text-on-surface">{FORMA_LABELS[forma] ?? forma}</p>
          </div>
        </div>
      </div>

      {/* Contrato */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
        <div className="border-b border-outline-variant/10 bg-surface-container-low/40 px-5 py-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">description</span>
          <p className="text-[13px] font-semibold text-on-surface-variant uppercase tracking-wider">
            Contrato de Prestação de Serviços Contábeis
          </p>
        </div>
        <div className="h-72 overflow-y-auto px-5 py-4 text-[13px] text-on-surface leading-relaxed space-y-4 custom-scrollbar">
          <p className="font-semibold text-[14px]">DAS PARTES</p>
          <p>
            <span className="font-semibold">CONTRATANTE:</span> {nome}{cpf ? `, CPF nº ${cpf}` : ''}.
          </p>
          <p>
            <span className="font-semibold">CONTRATADA:</span> {nomeEscritorio}, prestadora dos serviços contábeis digitais.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 1 – DO OBJETO</p>
          <p>
            O presente instrumento tem por objeto a prestação de serviços contábeis conforme o <span className="font-semibold">Plano {planoLabel}</span>, que compreende: escrituração contábil e fiscal; apuração e recolhimento de tributos; obrigações acessórias; folha de pagamento e encargos trabalhistas (conforme plano); declarações anuais aplicáveis; e atendimento via portal digital.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 2 – DO VALOR E PAGAMENTO</p>
          <p>
            O valor mensal pelos serviços prestados é de <span className="font-semibold">R$ {valor.toLocaleString('pt-BR')}/mês</span>, com vencimento todo dia <span className="font-semibold">{vencimento}</span> de cada mês, mediante <span className="font-semibold">{FORMA_LABELS[forma] ?? forma}</span>. O atraso superior a {diasMul} dias ensejará multa de {multa}% e juros de {juros}% ao mês. O inadimplemento superior a {diasInad} dias autoriza a suspensão dos serviços e rescisão do contrato.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 3 – DA VIGÊNCIA</p>
          <p>
            O contrato é celebrado por prazo indeterminado, podendo ser rescindido por qualquer das partes mediante comunicação prévia de {diasResc} dias.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 4 – OBRIGAÇÕES DO CONTRATANTE</p>
          <p>
            Fornecer documentos e informações tempestivamente; comunicar alterações societárias; efetuar pagamentos no prazo; não contratar terceiros para as mesmas atividades sem prévia comunicação.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 5 – OBRIGAÇÕES DA CONTRATADA</p>
          <p>
            Prestar os serviços com qualidade e diligência conforme normas do CFC; manter profissional habilitado e registrado no CRC; guardar sigilo profissional absoluto; cumprir os prazos legais, condicionado à entrega tempestiva de documentos pelo CONTRATANTE.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 6 – DA RESPONSABILIDADE</p>
          <p>
            A CONTRATADA não se responsabiliza por multas ou penalidades decorrentes de informações incorretas ou entregues fora do prazo pelo CONTRATANTE.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 7 – DA CONFIDENCIALIDADE</p>
          <p>
            As partes comprometem-se a manter sigilo absoluto sobre todas as informações trocadas no âmbito deste contrato.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 8 – DA ASSINATURA ELETRÔNICA</p>
          <p>
            Este contrato é celebrado eletronicamente nos termos da Lei nº 14.063/2020, mediante assinatura eletrônica avançada realizada pelo CONTRATANTE através de plataforma certificada, com registro de identidade, IP e timestamp auditável.
          </p>

          <p className="font-semibold text-[14px] pt-2">CLÁUSULA 9 – DO FORO</p>
          <p>
            Fica eleito o foro da comarca de domicílio da CONTRATADA para dirimir eventuais controvérsias, renunciando as partes a qualquer outro.
          </p>
        </div>
      </div>

      {/* Aceite */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm">
        <label className="flex items-start gap-3 cursor-pointer">
          <div
            onClick={() => setAceito(v => !v)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all cursor-pointer ${
              aceito ? 'border-primary bg-primary' : 'border-outline-variant/40'
            }`}
          >
            {aceito && <span className="material-symbols-outlined text-[13px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>}
          </div>
          <p className="text-[13px] text-on-surface leading-relaxed">
            Li e concordo com todos os termos do contrato acima e autorizo a prestação dos serviços conforme o <span className="font-semibold">Plano {planoLabel}</span>.
          </p>
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push(leadId ? `/onboarding/revisao?leadId=${leadId}&plano=${plano}` : '/onboarding/revisao')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/30 bg-white text-on-surface-variant hover:bg-surface-container transition-colors"
          aria-label="Voltar"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <button
          onClick={handleEnviar}
          disabled={loading || !aceito}
          className="flex flex-1 h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Enviando contrato…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>draw</span>
              Enviar para assinatura
            </>
          )}
        </button>
      </div>

      <p className="text-center text-[12px] text-on-surface-variant/60">
        <span className="material-symbols-outlined text-[13px] align-middle mr-1">mark_email_read</span>
        Você receberá um e-mail para assinar eletronicamente com validade jurídica
      </p>
    </div>
  )
}
