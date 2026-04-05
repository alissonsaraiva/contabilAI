'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatBRL } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

type Props = {
  clienteId: string
  vencimentoDia: number
  formaPagamento: string
  valorMensal: number
}

export function ClienteFinanceiroTab({ clienteId, vencimentoDia, formaPagamento, valorMensal }: Props) {
  const [data, setData] = useState<FinanceiroData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncLoading, setSyncLoading] = useState(false)
  const [alterandoVencimento, setAlterandoVencimento] = useState(false)
  const [novoDia, setNovoDia] = useState(String(vencimentoDia))
  const [novaForma, setNovaForma] = useState(formaPagamento)
  const [segundaViaLoading, setSegundaViaLoading] = useState<string | null>(null)
  const [expandidaId, setExpandidaId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null)
  const [provisionandoLoading, setProvisionandoLoading] = useState(false)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/clientes/${clienteId}/cobrancas`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { carregarDados() }, [carregarDados])

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
          <p className="mt-1 text-lg font-bold text-on-surface">{formatBRL(valorMensal)}</p>
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

        <div className="grid gap-5 p-6 md:grid-cols-2">
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
                        {c.pixQrCode && (
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
    </div>
  )
}
