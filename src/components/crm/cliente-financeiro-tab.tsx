'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatBRL, cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LimiteMeiWidget } from '@/components/ui/limite-mei-widget'

type CobrancaStatus = 'PENDING' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | 'CANCELLED'

type Cobranca = {
  id: string
  asaasId: string
  valor: number
  vencimento: string
  status: CobrancaStatus
  formaPagamento: 'pix' | 'boleto'
  linkBoleto: string | null
  codigoBarras: string | null
  pixQrCode: string | null
  pixCopiaECola: string | null
  pixExpirado: boolean
  pagoEm: string | null
  valorPago: number | null
}

type FinanceiroData = {
  asaasConfigurado: boolean
  asaasStatus: string | null
  asaasUltimoSync: string | null
  resumo: { emAberto: number; emAtraso: number }
  cobrancas: Cobranca[]
}

type DasMEI = {
  id: string
  competencia: string   // "AAAAMM"
  valor: number | null
  dataVencimento: string | null
  codigoBarras: string | null
  urlDas: string | null
  status: 'pendente' | 'paga' | 'vencida' | 'erro'
  erroMsg: string | null
  criadoEm: string
}

type DasMEIData = {
  regime: string | null
  procuracaoRFAtiva: boolean
  procuracaoRFVerificadaEm: string | null
  dasMeis: DasMEI[]
}

const STATUS_LABEL: Record<CobrancaStatus, string> = {
  PENDING:   'Pendente',
  RECEIVED:  'Pago',
  OVERDUE:   'Vencido',
  REFUNDED:  'Reembolsado',
  CANCELLED: 'Cancelado',
}

const STATUS_COLOR: Record<CobrancaStatus, string> = {
  PENDING:   'bg-primary/10 text-primary',
  RECEIVED:  'bg-green-status/10 text-green-status',
  OVERDUE:   'bg-error/10 text-error',
  REFUNDED:  'bg-surface-container text-on-surface-variant',
  CANCELLED: 'bg-surface-container text-on-surface-variant',
}

const DAS_STATUS_LABEL: Record<DasMEI['status'], string> = {
  pendente: 'Pendente',
  paga:     'Paga',
  vencida:  'Vencida',
  erro:     'Erro',
}

const DAS_STATUS_COLOR: Record<DasMEI['status'], string> = {
  pendente: 'bg-primary/10 text-primary',
  paga:     'bg-green-status/10 text-green-status',
  vencida:  'bg-error/10 text-error',
  erro:     'bg-orange-status/10 text-orange-status',
}

function formatarCompetencia(comp: string): string {
  return `${comp.slice(4, 6)}/${comp.slice(0, 4)}`
}

type Props = {
  clienteId: string
  vencimentoDia: number
  formaPagamento: string
  valorMensal: number
  regime?: string | null
}

export function ClienteFinanceiroTab({ clienteId, vencimentoDia, formaPagamento, valorMensal, regime }: Props) {
  const [data, setData] = useState<FinanceiroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncLoading, setSyncLoading] = useState(false)

  // Limite MEI
  type LimiteMEIData = {
    acumulado: number; limite: number; percentual: number
    zona: 'verde' | 'amarelo' | 'vermelho'; restante: number; ano: number
    porMes: { mes: number; ano: number; total: number }[]
  }
  const [limiteMei, setLimiteMei]         = useState<LimiteMEIData | null>(null)
  const [limiteMeiErro, setLimiteMeiErro] = useState(false)

  // DAS MEI
  const [dasData, setDasData]                   = useState<DasMEIData | null>(null)
  const [dasLoading, setDasLoading]             = useState(false)
  const [gerandoDAS, setGerandoDAS]             = useState(false)
  const [sincDASId, setSincDASId]               = useState<string | null>(null)
  const [atualizandoProcuracao, setAtualizandoProcuracao] = useState(false)
  const [competenciaInput, setCompetenciaInput] = useState('')
  const [mostrarInputComp, setMostrarInputComp] = useState(false)
  const [alterandoVencimento, setAlterandoVencimento] = useState(false)
  const [novoDia, setNovoDia] = useState(String(vencimentoDia))
  const [novaForma, setNovaForma] = useState(formaPagamento)
  const [segundaViaLoading, setSegundaViaLoading] = useState<string | null>(null)
  const [expandidaId, setExpandidaId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [provisionandoLoading, setProvisionandoLoading] = useState(false)
  // Estado local do valor da mensalidade — iniciado pela prop do server, atualizado ao salvar
  const [valorMensalAtual, setValorMensalAtual] = useState(valorMensal)
  const [novoValorMensal, setNovoValorMensal] = useState(String(valorMensal.toFixed(2)))
  const [alterandoMensalidade, setAlterandoMensalidade] = useState(false)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/cobrancas`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  const carregarDASMEI = useCallback(async () => {
    if (regime !== 'MEI') return
    setDasLoading(true)
    try {
      const [dasRes, limiteRes] = await Promise.all([
        fetch(`/api/crm/clientes/${clienteId}/das-mei`),
        fetch(`/api/crm/clientes/${clienteId}/limite-mei`),
      ])
      if (dasRes.ok) setDasData(await dasRes.json())
      if (limiteRes.ok) {
        const limiteJson = await limiteRes.json()
        if (limiteJson.regime === 'MEI') setLimiteMei(limiteJson)
        else setLimiteMeiErro(false)
      } else {
        setLimiteMeiErro(true)
      }
    } finally {
      setDasLoading(false)
    }
  }, [clienteId, regime])

  useEffect(() => { carregarDados() }, [carregarDados])
  useEffect(() => { carregarDASMEI() }, [carregarDASMEI])

  async function sincronizar() {
    setSyncLoading(true)
    setFeedback(null)
    try {
      await fetch(`/api/crm/clientes/${clienteId}/cobrancas`, { method: 'POST' })
      await carregarDados()
      setFeedback({ tipo: 'ok', msg: 'Cobranças sincronizadas com o Asaas.' })
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Erro ao sincronizar. Tente novamente.' })
    } finally {
      setSyncLoading(false)
    }
  }

  async function salvarVencimento() {
    const dia = parseInt(novoDia)
    if (!dia || dia < 1 || dia > 28) {
      setFeedback({ tipo: 'erro', msg: 'Dia inválido. Use um valor entre 1 e 28.' })
      return
    }
    setAlterandoVencimento(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/vencimento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dia }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao alterar vencimento.')
      setFeedback({
        tipo: 'ok',
        msg: body.proximoVencimento
          ? `Vencimento alterado. Próxima cobrança: ${new Date(body.proximoVencimento).toLocaleDateString('pt-BR')}.`
          : 'Vencimento alterado.',
      })
      await carregarDados()
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro ao alterar vencimento.' })
    } finally {
      setAlterandoVencimento(false)
    }
  }

  async function salvarForma() {
    if (novaForma !== 'pix' && novaForma !== 'boleto') return
    setFeedback(null)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/forma-pagamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forma: novaForma }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao alterar forma de pagamento.')
      setFeedback({ tipo: 'ok', msg: 'Forma de pagamento atualizada.' })
      await carregarDados()
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro.' })
    }
  }

  async function salvarMensalidade() {
    const valor = parseFloat(novoValorMensal.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      setFeedback({ tipo: 'erro', msg: 'Valor inválido. Informe um valor maior que zero.' })
      return
    }
    const valorFinal = Math.round(valor * 100) / 100
    if (!confirm(
      `Alterar a mensalidade de ${formatBRL(valorMensalAtual)} para ${formatBRL(valorFinal)}?\n\n` +
      `Esta alteração será propagada para o Asaas e afetará cobranças em aberto.`
    )) return

    setAlterandoMensalidade(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/mensalidade`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ valor: valorFinal }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao alterar mensalidade.')
      setValorMensalAtual(valorFinal)
      setNovoValorMensal(valorFinal.toFixed(2))
      setFeedback({
        tipo: 'ok',
        msg: body.asaas
          ? `Mensalidade alterada para ${formatBRL(valorFinal)} e atualizada no Asaas.`
          : `Mensalidade alterada para ${formatBRL(valorFinal)} (cliente sem Asaas — apenas local).`,
      })
      await carregarDados()
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro ao alterar mensalidade.' })
    } finally {
      setAlterandoMensalidade(false)
    }
  }

  async function provisionar() {
    if (!confirm('Provisionar este cliente no Asaas? Isso criará um customer e uma subscription de cobrança recorrente.')) return
    setProvisionandoLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/provisionar`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao provisionar.')
      setFeedback({ tipo: 'ok', msg: body.mensagem ?? 'Cliente provisionado no Asaas com sucesso.' })
      await carregarDados()
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro ao provisionar.' })
    } finally {
      setProvisionandoLoading(false)
    }
  }

  async function gerarDASManual(competencia?: string) {
    setGerandoDAS(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/das-mei`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(competencia ? { competencia } : {}),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao gerar DAS.')
      setFeedback({ tipo: 'ok', msg: body.status === 'erro' ? `DAS gerada com erro: ${body.erroMsg}` : 'DAS gerada com sucesso.' })
      await carregarDASMEI()
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro ao gerar DAS.' })
    } finally {
      setGerandoDAS(false)
    }
  }

  async function atualizarProcuracao(ativo: boolean) {
    setAtualizandoProcuracao(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/das-mei`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ procuracaoRFAtiva: ativo }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao atualizar procuração.')
      setFeedback({ tipo: 'ok', msg: ativo ? 'Procuração marcada como ativa. DAS será gerada automaticamente.' : 'Procuração marcada como inativa.' })
      await carregarDASMEI()
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro ao atualizar procuração.' })
    } finally {
      setAtualizandoProcuracao(false)
    }
  }

  async function sincronizarPagamentoDAS(dasId: string) {
    setSincDASId(dasId)
    setFeedback(null)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/das-mei/${dasId}/sincronizar`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao sincronizar pagamento.')
      setFeedback({ tipo: 'ok', msg: body.status === 'paga' ? 'DAS confirmada como paga!' : 'Sincronizado. DAS ainda não paga.' })
      await carregarDASMEI()
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro ao sincronizar.' })
    } finally {
      setSincDASId(null)
    }
  }

  async function gerarSegundaVia(cobrancaId: string) {
    setSegundaViaLoading(cobrancaId)
    setFeedback(null)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/cobrancas/${cobrancaId}/segunda-via`, {
        method: 'POST',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao gerar segunda via.')
      setFeedback({ tipo: 'ok', msg: 'Segunda via gerada. Aparecerá na lista abaixo.' })
      await carregarDados()
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Erro.' })
    } finally {
      setSegundaViaLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[24px] text-on-surface-variant/40">progress_activity</span>
      </div>
    )
  }

  const asaasConfigurado = data?.asaasConfigurado ?? false

  return (
    <div className="space-y-5">

      {/* Feedback */}
      {feedback && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${feedback.tipo === 'ok' ? 'bg-green-status/10 text-green-status' : 'bg-error/10 text-error'}`}>
          <span className="material-symbols-outlined text-[16px]">
            {feedback.tipo === 'ok' ? 'check_circle' : 'error'}
          </span>
          {feedback.msg}
        </div>
      )}

      {/* Resumo */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Mensalidade</p>
          <p className="mt-1 text-lg font-bold text-on-surface">{formatBRL(valorMensalAtual)}</p>
        </Card>
        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Em aberto</p>
          <p className={`mt-1 text-lg font-bold ${(data?.resumo.emAberto ?? 0) > 0 ? 'text-orange-status' : 'text-on-surface'}`}>
            {formatBRL(data?.resumo.emAberto ?? 0)}
          </p>
        </Card>
        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Em atraso</p>
          <p className={`mt-1 text-lg font-bold ${(data?.resumo.emAtraso ?? 0) > 0 ? 'text-error' : 'text-on-surface'}`}>
            {formatBRL(data?.resumo.emAtraso ?? 0)}
          </p>
        </Card>
        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Status Asaas</p>
          {!asaasConfigurado ? (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-sm text-on-surface-variant/70">Não provisionado</p>
              <Button
                size="sm"
                onClick={provisionar}
                disabled={provisionandoLoading}
                className="text-xs gap-1.5 w-fit"
              >
                <span className={`material-symbols-outlined text-[13px] ${provisionandoLoading ? 'animate-spin' : ''}`}>
                  {provisionandoLoading ? 'progress_activity' : 'add_circle'}
                </span>
                {provisionandoLoading ? 'Provisionando…' : 'Provisionar no Asaas'}
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-sm font-semibold text-on-surface">
              {data?.asaasStatus === 'ACTIVE'   ? 'Ativo'
              : data?.asaasStatus === 'OVERDUE'  ? 'Inadimplente'
              : data?.asaasStatus === 'INACTIVE' ? 'Inativo'
              : data?.asaasStatus ?? '—'}
            </p>
          )}
        </Card>
      </div>

      {/* Configurações de cobrança */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>settings</span>
            <h3 className="font-headline text-base font-semibold text-on-surface">Configurações de cobrança</h3>
          </div>
          {asaasConfigurado && (
            <Button
              variant="ghost"
              size="sm"
              onClick={sincronizar}
              disabled={syncLoading}
              className="text-xs text-on-surface-variant gap-1.5"
            >
              <span className={`material-symbols-outlined text-[14px] ${syncLoading ? 'animate-spin' : ''}`}>sync</span>
              Sincronizar
            </Button>
          )}
        </div>

        <div className="grid gap-5 p-6 md:grid-cols-3">
          {/* Alterar valor da mensalidade */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-on-surface-variant">Valor da mensalidade (R$)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                step={0.01}
                value={novoValorMensal}
                onChange={e => setNovoValorMensal(e.target.value)}
                className="h-9 w-28 rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={salvarMensalidade}
                disabled={
                  alterandoMensalidade ||
                  isNaN(parseFloat(novoValorMensal.replace(',', '.'))) ||
                  parseFloat(novoValorMensal.replace(',', '.')) <= 0 ||
                  parseFloat(novoValorMensal.replace(',', '.')) === valorMensalAtual
                }
                className="text-xs"
              >
                {alterandoMensalidade ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
            {asaasConfigurado && (
              <p className="text-[11px] text-on-surface-variant/60">Atualiza cobranças em aberto e futuras no Asaas.</p>
            )}
          </div>

          {/* Alterar vencimento */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-on-surface-variant">Dia de vencimento</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={28}
                value={novoDia}
                onChange={e => setNovoDia(e.target.value)}
                className="h-9 w-20 rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={salvarVencimento}
                disabled={alterandoVencimento || novoDia === String(vencimentoDia)}
                className="text-xs"
              >
                {alterandoVencimento ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
            {asaasConfigurado && (
              <p className="text-[11px] text-on-surface-variant/60">Atualiza cobranças em aberto e futuras no Asaas.</p>
            )}
          </div>

          {/* Alterar forma de pagamento */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-on-surface-variant">Forma de pagamento</label>
            <div className="flex items-center gap-2">
              <select
                value={novaForma}
                onChange={e => setNovaForma(e.target.value)}
                className="h-9 rounded-xl border border-outline-variant/30 bg-surface px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="pix">PIX</option>
                <option value="boleto">Boleto bancário</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={salvarForma}
                disabled={novaForma === formaPagamento}
                className="text-xs"
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de cobranças */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-outline-variant/10">
          <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
          <h3 className="font-headline text-base font-semibold text-on-surface">Cobranças</h3>
          <span className="ml-1 rounded-full bg-primary/10 px-2 py-[1px] text-[10px] font-bold text-primary">
            {data?.cobrancas.length ?? 0}
          </span>
        </div>

        {!asaasConfigurado && (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[36px] opacity-30">account_balance</span>
            <div>
              <p className="text-sm">Cliente não provisionado no Asaas.</p>
              <p className="text-xs opacity-70 mt-0.5">Provisione para ativar cobranças recorrentes.</p>
            </div>
            <Button
              size="sm"
              onClick={provisionar}
              disabled={provisionandoLoading}
              className="text-xs gap-1.5"
            >
              <span className={`material-symbols-outlined text-[13px] ${provisionandoLoading ? 'animate-spin' : ''}`}>
                {provisionandoLoading ? 'progress_activity' : 'add_circle'}
              </span>
              {provisionandoLoading ? 'Provisionando…' : 'Provisionar no Asaas'}
            </Button>
          </div>
        )}

        {asaasConfigurado && (!data?.cobrancas.length) && (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[36px] opacity-30">inbox</span>
            <p className="text-sm">Nenhuma cobrança encontrada.</p>
          </div>
        )}

        {asaasConfigurado && !!data?.cobrancas.length && (
          <div className="divide-y divide-outline-variant/10">
            {data.cobrancas.map(c => (
              <div key={c.id}>
                <div className="flex items-center gap-4 px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-on-surface">
                        {new Date(c.vencimento).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', day: '2-digit' })}
                      </span>
                      <span className={`rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                      <span className="text-[11px] text-on-surface-variant/60">
                        {c.formaPagamento === 'pix' ? 'PIX' : 'Boleto'}
                      </span>
                    </div>
                    {c.pagoEm && (
                      <p className="text-[11px] text-green-status mt-0.5">
                        Pago em {new Date(c.pagoEm).toLocaleDateString('pt-BR')}
                        {c.valorPago != null && c.valorPago !== c.valor && ` · ${formatBRL(c.valorPago)}`}
                      </p>
                    )}
                  </div>

                  <span className="text-sm font-bold text-on-surface whitespace-nowrap">{formatBRL(c.valor)}</span>

                  <div className="flex items-center gap-1">
                    {/* Ver link/QR */}
                    {(c.status === 'PENDING' || c.status === 'OVERDUE') && (c.linkBoleto || c.pixCopiaECola || c.pixQrCode) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandidaId(expandidaId === c.id ? null : c.id)}
                        className="h-7 px-2 text-[11px] text-primary"
                      >
                        {expandidaId === c.id ? 'Ocultar' : 'Ver link'}
                      </Button>
                    )}
                    {/* Segunda via */}
                    {(c.status === 'OVERDUE' || c.status === 'PENDING') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => gerarSegundaVia(c.id)}
                        disabled={segundaViaLoading === c.id}
                        className="h-7 px-2 text-[11px] text-on-surface-variant hover:text-on-surface"
                      >
                        {segundaViaLoading === c.id ? '…' : '2ª via'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Detalhes expandidos */}
                {expandidaId === c.id && (
                  <div className="bg-surface-container/40 px-6 pb-4 pt-0">
                    {c.formaPagamento === 'pix' && c.pixCopiaECola && (
                      <div className="space-y-2">
                        {c.pixExpirado && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-orange-status/10 px-3 py-2 text-[11px] text-orange-status">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            QR Code expirado (mais de 20h). Gere uma 2ª via para criar novo código PIX.
                          </div>
                        )}
                        {c.pixQrCode && !c.pixExpirado && (
                          <img
                            src={`data:image/png;base64,${c.pixQrCode}`}
                            alt="QR Code PIX"
                            className="h-32 w-32 rounded-xl border border-outline-variant/20"
                          />
                        )}
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] text-on-surface-variant/70 truncate max-w-xs font-mono">{c.pixCopiaECola.slice(0, 40)}…</p>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={c.pixExpirado}
                            onClick={() => { navigator.clipboard.writeText(c.pixCopiaECola!); setFeedback({ tipo: 'ok', msg: 'PIX copiado!' }) }}
                            className="h-6 px-2 text-[10px] shrink-0"
                          >
                            Copiar PIX
                          </Button>
                        </div>
                      </div>
                    )}
                    {c.formaPagamento === 'boleto' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {c.linkBoleto && (
                          <a
                            href={c.linkBoleto}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                          >
                            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                            Abrir boleto
                          </a>
                        )}
                        {c.codigoBarras && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { navigator.clipboard.writeText(c.codigoBarras!); setFeedback({ tipo: 'ok', msg: 'Código de barras copiado!' }) }}
                            className="h-6 px-2 text-[10px]"
                          >
                            Copiar código de barras
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {data?.asaasUltimoSync && (
        <p className="text-right text-[11px] text-on-surface-variant/50">
          Último sync: {new Date(data.asaasUltimoSync).toLocaleString('pt-BR')}
        </p>
      )}

      {/* ─── Limite MEI — régua de faturamento anual ───────────────────────────── */}
      {regime === 'MEI' && limiteMei && (
        <LimiteMeiWidget
          acumulado={limiteMei.acumulado}
          limite={limiteMei.limite}
          percentual={limiteMei.percentual}
          zona={limiteMei.zona}
          restante={limiteMei.restante}
          ano={limiteMei.ano}
          variant="crm"
          porMes={limiteMei.porMes}
        />
      )}
      {regime === 'MEI' && limiteMeiErro && !limiteMei && (
        <div className="flex items-center gap-2 rounded-xl border border-outline-variant/15 bg-surface-container/50 px-4 py-3 text-[12px] text-on-surface-variant/60">
          <span className="material-symbols-outlined text-[16px]">warning</span>
          Não foi possível carregar o limite MEI. Verifique se o cliente possui NFS-e emitidas no sistema.
        </div>
      )}

      {/* ─── Seção DAS MEI — exibida apenas para clientes MEI ─────────────────── */}
      {regime === 'MEI' && (
        <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
              <h3 className="font-headline text-base font-semibold text-on-surface">DAS MEI</h3>
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-[1px] text-[10px] font-bold text-primary">
                {dasData?.dasMeis.length ?? 0}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Procuração status — clicável para toggle */}
              {dasData && (
                <button
                  type="button"
                  onClick={() => atualizarProcuracao(!dasData.procuracaoRFAtiva)}
                  disabled={atualizandoProcuracao}
                  title={dasData.procuracaoRFAtiva ? 'Clique para marcar como inativa' : 'Clique para marcar como ativa'}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-opacity',
                    dasData.procuracaoRFAtiva
                      ? 'bg-green-status/10 text-green-status hover:bg-green-status/20'
                      : 'bg-orange-status/10 text-orange-status hover:bg-orange-status/20',
                    atualizandoProcuracao && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {atualizandoProcuracao ? 'progress_activity' : dasData.procuracaoRFAtiva ? 'verified' : 'warning'}
                  </span>
                  {dasData.procuracaoRFAtiva ? 'Procuração ativa' : 'Sem procuração'}
                </button>
              )}
              {/* Gerar competência específica */}
              {mostrarInputComp ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={competenciaInput}
                    onChange={e => setCompetenciaInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="AAAAMM"
                    maxLength={6}
                    className="h-7 w-24 rounded-lg border border-outline-variant/30 bg-surface px-2 text-[12px] text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (competenciaInput.length === 6) {
                        gerarDASManual(competenciaInput)
                        setMostrarInputComp(false)
                        setCompetenciaInput('')
                      }
                    }}
                    disabled={competenciaInput.length !== 6 || gerandoDAS}
                    className="h-7 text-[11px] px-2"
                  >OK</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setMostrarInputComp(false); setCompetenciaInput('') }}
                    className="h-7 px-2 text-[11px]"
                  >✕</Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMostrarInputComp(true)}
                    disabled={gerandoDAS || dasLoading}
                    className="h-7 px-2 text-[11px] text-on-surface-variant"
                    title="Gerar DAS de competência específica"
                  >
                    <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => gerarDASManual()}
                    disabled={gerandoDAS || dasLoading}
                    className="text-xs gap-1.5"
                  >
                    <span className={cn('material-symbols-outlined text-[13px]', gerandoDAS && 'animate-spin')}>
                      {gerandoDAS ? 'progress_activity' : 'add_circle'}
                    </span>
                    {gerandoDAS ? 'Gerando…' : 'Gerar DAS'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {dasLoading && (
            <div className="flex items-center justify-center py-10">
              <span className="material-symbols-outlined animate-spin text-[24px] text-on-surface-variant/40">progress_activity</span>
            </div>
          )}

          {!dasLoading && dasData && !dasData.procuracaoRFAtiva && (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
              <span className="material-symbols-outlined text-[36px] text-orange-status/40">warning</span>
              <p className="text-sm text-on-surface-variant">Procuração digital não ativa.</p>
              <p className="text-[11px] text-on-surface-variant/60">
                O cliente precisa conceder procuração ao escritório via e-CAC para que a DAS seja gerada automaticamente.
                Após o cliente cadastrar a procuração, marque como ativa abaixo.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => atualizarProcuracao(true)}
                disabled={atualizandoProcuracao}
                className="text-[11px] gap-1.5 mt-1"
              >
                <span className={cn('material-symbols-outlined text-[13px]', atualizandoProcuracao && 'animate-spin')}>
                  {atualizandoProcuracao ? 'progress_activity' : 'check_circle'}
                </span>
                {atualizandoProcuracao ? 'Salvando…' : 'Marcar procuração como ativa'}
              </Button>
            </div>
          )}

          {!dasLoading && dasData?.procuracaoRFAtiva && !dasData.dasMeis.length && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[36px] opacity-30">receipt_long</span>
              <p className="text-sm">Nenhuma DAS gerada ainda.</p>
              <p className="text-[11px] opacity-60">Clique em "Gerar DAS" para gerar manualmente.</p>
            </div>
          )}

          {!dasLoading && !!dasData?.dasMeis.length && (
            <div className="divide-y divide-outline-variant/10">
              {dasData.dasMeis.map(das => (
                <div key={das.id} className="flex items-center gap-4 px-6 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-on-surface">
                        {formatarCompetencia(das.competencia)}
                      </span>
                      <span className={cn('rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-wider', DAS_STATUS_COLOR[das.status])}>
                        {DAS_STATUS_LABEL[das.status]}
                      </span>
                    </div>
                    {das.dataVencimento && (
                      <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                        Venc.: {new Date(das.dataVencimento).toLocaleDateString('pt-BR')}
                        {das.valor != null && ` · ${formatBRL(das.valor)}`}
                      </p>
                    )}
                    {das.erroMsg && (
                      <p className="text-[10px] text-orange-status mt-0.5 truncate max-w-xs">{das.erroMsg}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Copiar código de barras */}
                    {das.codigoBarras && das.status !== 'paga' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { navigator.clipboard.writeText(das.codigoBarras!); setFeedback({ tipo: 'ok', msg: 'Código de barras copiado!' }) }}
                        className="h-7 px-2 text-[11px] text-on-surface-variant"
                        title="Copiar código de barras"
                      >
                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                      </Button>
                    )}
                    {/* Link da DAS */}
                    {das.urlDas && (
                      <a
                        href={das.urlDas}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-7 items-center gap-1 rounded-xl px-2 text-[11px] text-primary hover:bg-primary/5"
                        title="Abrir DAS"
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      </a>
                    )}
                    {/* Sincronizar pagamento */}
                    {das.status !== 'paga' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => sincronizarPagamentoDAS(das.id)}
                        disabled={sincDASId === das.id}
                        className="h-7 px-2 text-[11px] text-on-surface-variant hover:text-on-surface"
                        title="Sincronizar pagamento"
                      >
                        <span className={cn('material-symbols-outlined text-[14px]', sincDASId === das.id && 'animate-spin')}>
                          {sincDASId === das.id ? 'progress_activity' : 'sync'}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
