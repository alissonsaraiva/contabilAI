'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { formatBRL } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LimiteMeiWidget } from '@/components/ui/limite-mei-widget'

type CobrancaStatus = 'PENDING' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | 'CANCELLED'

type CobrancaAberta = {
  id: string
  valor: number
  vencimento: string
  status: CobrancaStatus
  formaPagamento: 'pix' | 'boleto'
  linkBoleto: string | null
  codigoBarras: string | null
  pixQrCode: string | null
  pixCopiaECola: string | null
  atualizadoEm: string | null
  pixExpirado?: boolean
}

type CobrancaHistorico = {
  id: string
  valor: number
  vencimento: string
  status: CobrancaStatus
  formaPagamento: 'pix' | 'boleto'
  pagoEm: string | null
  valorPago: number | null
  invoiceUrl: string | null
}

const STATUS_LABEL: Record<CobrancaStatus, string> = {
  PENDING:   'Em aberto',
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

const FORMA_LABELS: Record<string, string> = {
  boleto: 'Boleto bancário',
  pix:    'PIX',
}

type DasMEIPortal = {
  id: string
  competencia: string
  valor: number | null
  dataVencimento: string | null
  codigoBarras: string | null
  urlDas: string | null
  status: 'pendente' | 'paga' | 'vencida' | 'erro'
  criadoEm: string
}

const DAS_STATUS_LABEL: Record<DasMEIPortal['status'], string> = {
  pendente: 'Pendente',
  paga:     'Paga',
  vencida:  'Vencida',
  erro:     'Aguardando',
}

const DAS_STATUS_COLOR: Record<DasMEIPortal['status'], string> = {
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
  valorMensal: number
  vencimentoDia: number
  formaPagamento: string
  asaasAtivo: boolean
  regime?: string | null
  procuracaoRFAtiva?: boolean
}

export function PortalFinanceiroClient({ clienteId, valorMensal, vencimentoDia, formaPagamento, asaasAtivo, regime, procuracaoRFAtiva = true }: Props) {
  const [cobrancaAberta, setCobrancaAberta] = useState<CobrancaAberta | null | undefined>(undefined)
  const [historico, setHistorico]   = useState<CobrancaHistorico[]>([])
  const [loading, setLoading]       = useState(true)
  const [copiado, setCopiado]       = useState(false)
  const [segundaViaLoading, setSegundaViaLoading] = useState(false)
  const [erro, setErro]             = useState<string | null>(null)

  // Estado editável dos cards de configuração
  const [diaVencimento, setDiaVencimento] = useState(vencimentoDia)
  const [forma, setForma]                 = useState<'pix' | 'boleto'>(formaPagamento as 'pix' | 'boleto')

  // Edição de vencimento
  const [editandoVencimento, setEditandoVencimento]   = useState(false)
  const [novoVencimentoDia, setNovoVencimentoDia]     = useState(vencimentoDia)
  const [salvandoVencimento, setSalvandoVencimento]   = useState(false)
  const [erroVencimento, setErroVencimento]           = useState<string | null>(null)
  const [sucessoVencimento, setSucessoVencimento]     = useState<string | null>(null)

  // Edição de forma de pagamento
  const [editandoForma, setEditandoForma]   = useState(false)
  const [novaForma, setNovaForma]           = useState<'pix' | 'boleto'>(formaPagamento as 'pix' | 'boleto')
  const [salvandoForma, setSalvandoForma]   = useState(false)
  const [erroForma, setErroForma]           = useState<string | null>(null)
  const [sucessoForma, setSucessoForma]     = useState<string | null>(null)

  // Extrato
  const [baixandoExtrato, setBaixandoExtrato] = useState(false)

  // DAS MEI
  const [dasMeis, setDasMeis]         = useState<DasMEIPortal[]>([])
  const [dasLoading, setDasLoading]   = useState(false)
  const [dasErro, setDasErro]         = useState<string | null>(null)
  const [copiandoDAS, setCopiandoDAS] = useState<string | null>(null)

  // Limite MEI
  type LimiteMEIData = {
    acumulado: number; limite: number; percentual: number
    zona: 'verde' | 'amarelo' | 'vermelho'; restante: number; ano: number
    porMes: { mes: number; ano: number; total: number }[]
  }
  const [limiteMei, setLimiteMei]       = useState<LimiteMEIData | null>(null)
  const [limiteMeiErro, setLimiteMeiErro] = useState(false)

  // Guard de double-click para segunda via (React state é assíncrono — ref é síncrono)
  const segundaViaEmAndamento = useRef(false)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [abertaRes, historicoRes] = await Promise.all([
        fetch('/api/portal/financeiro/cobranca-aberta'),
        fetch('/api/portal/financeiro/cobrancas'),
      ])
      if (abertaRes.ok)    setCobrancaAberta(await abertaRes.json())
      if (historicoRes.ok) setHistorico(await historicoRes.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarDASMEI = useCallback(async () => {
    if (regime !== 'MEI') return
    setDasLoading(true)
    setDasErro(null)
    try {
      const [dasRes, limiteRes] = await Promise.all([
        fetch('/api/portal/financeiro/das-mei'),
        fetch('/api/portal/financeiro/limite-mei'),
      ])
      if (!dasRes.ok) throw new Error(`Erro ${dasRes.status} ao carregar DAS.`)
      const dasJson = await dasRes.json()
      setDasMeis(dasJson.dasMeis ?? [])
      if (limiteRes.ok) {
        const limiteJson = await limiteRes.json()
        if (limiteJson.regime === 'MEI') setLimiteMei(limiteJson)
        else setLimiteMeiErro(false)
      } else {
        setLimiteMeiErro(true)
      }
    } catch (err) {
      setLimiteMeiErro(true)
      setDasErro(err instanceof Error ? err.message : 'Não foi possível carregar as DAS MEI.')
    } finally {
      setDasLoading(false)
    }
  }, [regime])

  useEffect(() => { carregarDados() }, [carregarDados])
  useEffect(() => { carregarDASMEI() }, [carregarDASMEI])

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function gerarSegundaVia(cobrancaId: string) {
    // Guard síncrono contra double-click (state updates são assíncronos no React)
    if (segundaViaEmAndamento.current) return
    segundaViaEmAndamento.current = true
    setSegundaViaLoading(true)
    setErro(null)
    try {
      const res  = await fetch('/api/portal/financeiro/segunda-via', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ cobrancaId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao gerar segunda via.')
      await carregarDados()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar segunda via.')
    } finally {
      setSegundaViaLoading(false)
      segundaViaEmAndamento.current = false
    }
  }

  async function salvarVencimento() {
    setSalvandoVencimento(true)
    setErroVencimento(null)
    setSucessoVencimento(null)
    try {
      const res  = await fetch('/api/portal/financeiro/vencimento', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dia: novoVencimentoDia }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao alterar vencimento.')
      setDiaVencimento(novoVencimentoDia)
      setEditandoVencimento(false)
      setSucessoVencimento(
        body.proximoVencimento
          ? `Próximo vencimento: ${new Date(body.proximoVencimento).toLocaleDateString('pt-BR')}`
          : 'Vencimento atualizado com sucesso.',
      )
      setTimeout(() => setSucessoVencimento(null), 5000)
      await carregarDados()
    } catch (err) {
      setErroVencimento(err instanceof Error ? err.message : 'Erro ao alterar vencimento.')
    } finally {
      setSalvandoVencimento(false)
    }
  }

  async function salvarForma() {
    setSalvandoForma(true)
    setErroForma(null)
    setSucessoForma(null)
    try {
      const res  = await fetch('/api/portal/financeiro/forma-pagamento', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ forma: novaForma }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao alterar forma de pagamento.')
      setForma(novaForma)
      setEditandoForma(false)
      setSucessoForma('Forma de pagamento atualizada. As cobranças em aberto serão atualizadas em breve.')
      setTimeout(() => setSucessoForma(null), 6000)
      await carregarDados()
    } catch (err) {
      setErroForma(err instanceof Error ? err.message : 'Erro ao alterar forma de pagamento.')
    } finally {
      setSalvandoForma(false)
    }
  }

  async function baixarExtrato() {
    setBaixandoExtrato(true)
    try {
      const res  = await fetch('/api/portal/financeiro/extrato')
      if (!res.ok) throw new Error('Erro ao gerar extrato.')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'extrato-financeiro.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao baixar extrato.')
    } finally {
      setBaixandoExtrato(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[24px] text-on-surface-variant/40">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Cobrança em aberto — aparece no topo quando existir */}
      {asaasAtivo && cobrancaAberta && (
        <Card className="border-outline-variant/15 bg-card shadow-sm overflow-hidden rounded-[16px]">
          <div className={`p-4 sm:px-6 sm:py-4 border-b border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${cobrancaAberta.status === 'OVERDUE' ? 'bg-error/5' : ''}`}>
            <div className="flex items-center gap-3">
              <span
                className={`material-symbols-outlined text-[20px] ${cobrancaAberta.status === 'OVERDUE' ? 'text-error' : 'text-primary'}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {cobrancaAberta.status === 'OVERDUE' ? 'warning' : 'receipt'}
              </span>
              <div>
                <h3 className="font-headline text-base font-semibold text-on-surface">
                  {cobrancaAberta.status === 'OVERDUE' ? 'Cobrança vencida' : 'Cobrança atual'}
                </h3>
                <p className="text-[12px] text-on-surface-variant/70">
                  Vencimento: {new Date(cobrancaAberta.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="sm:text-right flex sm:block items-center justify-between">
              <p className="text-xl font-bold text-on-surface">{formatBRL(cobrancaAberta.valor)}</p>
              <span className={`text-[10px] font-bold uppercase px-2 py-[1px] rounded-full ${STATUS_COLOR[cobrancaAberta.status]}`}>
                {STATUS_LABEL[cobrancaAberta.status]}
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            {/* PIX expirado */}
            {cobrancaAberta.formaPagamento === 'pix' && !!cobrancaAberta.pixExpirado && (
              <div className="flex items-start gap-2 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">
                <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">warning</span>
                <span>O código PIX pode estar expirado. Gere uma segunda via para obter um novo código atualizado.</span>
              </div>
            )}

            {/* PIX válido */}
            {cobrancaAberta.formaPagamento === 'pix' && cobrancaAberta.pixCopiaECola && !cobrancaAberta.pixExpirado && (
              <div className="space-y-4">
                {cobrancaAberta.pixQrCode && (
                  <div className="flex justify-center">
                    <img
                      src={`data:image/png;base64,${cobrancaAberta.pixQrCode}`}
                      alt="QR Code PIX"
                      className="h-44 w-44 rounded-xl border border-outline-variant/20 shadow-sm bg-white p-2"
                    />
                  </div>
                )}
                <p className="text-[13px] text-on-surface-variant/80 leading-relaxed text-center">
                  Abra o app do seu banco, acesse a área PIX e escaneie o código abaixo.
                </p>
                <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container/50 px-3 py-2">
                  <p className="truncate text-[11px] font-mono text-on-surface-variant">
                    {cobrancaAberta.pixCopiaECola.slice(0, 60)}…
                  </p>
                </div>
                <Button
                  size="default"
                  onClick={() => copiar(cobrancaAberta!.pixCopiaECola!)}
                  className="w-full gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {copiado ? 'check_circle' : 'content_copy'}
                  </span>
                  {copiado ? 'Código copiado!' : 'Copiar código PIX'}
                </Button>
                {copiado && (
                  <p className="text-[11px] text-on-surface-variant/60 text-center">
                    Após efetuar o pagamento, a confirmação pode levar alguns minutos.
                  </p>
                )}
              </div>
            )}

            {/* Boleto */}
            {cobrancaAberta.formaPagamento === 'boleto' && (
              <div className="space-y-3">
                <p className="text-[13px] text-on-surface-variant/80">
                  Pague o boleto bancário no seu banco, lotérica ou pelo app do banco.
                </p>
                <div className="flex flex-wrap gap-2">
                  {cobrancaAberta.linkBoleto && (
                    <a
                      href={cobrancaAberta.linkBoleto}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary shadow-sm hover:bg-primary/90 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                      Abrir boleto
                    </a>
                  )}
                  {cobrancaAberta.codigoBarras && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copiar(cobrancaAberta!.codigoBarras!)}
                      className="gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copiado ? 'check' : 'content_copy'}
                      </span>
                      {copiado ? 'Copiado!' : 'Copiar código de barras'}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Segunda via — vencidas ou PIX expirado */}
            {(cobrancaAberta.status === 'OVERDUE' || (cobrancaAberta.status === 'PENDING' && !!cobrancaAberta.pixExpirado)) && (
              <div className="border-t border-outline-variant/10 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => gerarSegundaVia(cobrancaAberta.id)}
                  disabled={segundaViaLoading}
                  className="text-xs gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  {segundaViaLoading ? 'Gerando segunda via…' : 'Gerar segunda via (venc. em 3 dias)'}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Erro geral */}
      {erro && (
        <div className="flex items-center gap-2 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {erro}
        </div>
      )}

      {/* Resumo da mensalidade */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Mensalidade */}
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-status/10">
            <span className="material-symbols-outlined text-[22px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Mensalidade</p>
          <p className="text-xl font-bold text-on-surface mt-1">{formatBRL(valorMensal)}</p>
        </Card>

        {/* Dia de vencimento — editável */}
        <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>event_repeat</span>
              </div>
              {asaasAtivo && !editandoVencimento && (
                <button
                  onClick={() => { setEditandoVencimento(true); setNovoVencimentoDia(diaVencimento); setErroVencimento(null) }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                  title="Alterar dia de vencimento"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  Alterar
                </button>
              )}
            </div>
            <p className="text-[12px] font-medium text-on-surface-variant/70">Dia de vencimento</p>
            {editandoVencimento ? (
              <div className="mt-2 space-y-3">
                <select
                  value={novoVencimentoDia}
                  onChange={e => setNovoVencimentoDia(Number(e.target.value))}
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container/50 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>Dia {d}</option>
                  ))}
                </select>
                <p className="text-[10px] text-on-surface-variant/60">
                  A alteração será aplicada também à cobrança em aberto.
                </p>
                {erroVencimento && (
                  <p className="text-[11px] text-error">{erroVencimento}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={salvarVencimento}
                    disabled={salvandoVencimento || novoVencimentoDia === diaVencimento}
                    className="flex-1 text-xs gap-1"
                  >
                    {salvandoVencimento
                      ? <><span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> Salvando…</>
                      : <><span className="material-symbols-outlined text-[12px]">check</span> Salvar</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditandoVencimento(false); setErroVencimento(null) }}
                    disabled={salvandoVencimento}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xl font-bold text-on-surface mt-1">Todo dia {diaVencimento}</p>
            )}
          </div>
        </Card>

        {/* Forma de pagamento — editável */}
        <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>credit_card</span>
              </div>
              {asaasAtivo && !editandoForma && (
                <button
                  onClick={() => { setEditandoForma(true); setNovaForma(forma); setErroForma(null) }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                  title="Alterar forma de pagamento"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  Alterar
                </button>
              )}
            </div>
            <p className="text-[12px] font-medium text-on-surface-variant/70">Forma de pagamento</p>
            {editandoForma ? (
              <div className="mt-2 space-y-3">
                <div className="flex flex-col gap-2">
                  {(['pix', 'boleto'] as const).map(op => (
                    <label
                      key={op}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${novaForma === op ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:bg-surface-container/40'}`}
                    >
                      <input
                        type="radio"
                        name="forma"
                        value={op}
                        checked={novaForma === op}
                        onChange={() => setNovaForma(op)}
                        className="accent-primary"
                      />
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant/70" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {op === 'pix' ? 'qr_code_2' : 'receipt_long'}
                      </span>
                      <span className="text-sm font-medium text-on-surface">{FORMA_LABELS[op]}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-on-surface-variant/60">
                  A cobrança em aberto será regenerada na nova forma em breve.
                </p>
                {erroForma && (
                  <p className="text-[11px] text-error">{erroForma}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={salvarForma}
                    disabled={salvandoForma || novaForma === forma}
                    className="flex-1 text-xs gap-1"
                  >
                    {salvandoForma
                      ? <><span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> Salvando…</>
                      : <><span className="material-symbols-outlined text-[12px]">check</span> Salvar</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditandoForma(false); setErroForma(null) }}
                    disabled={salvandoForma}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[15px] font-bold text-on-surface mt-1">
                {FORMA_LABELS[forma] ?? forma}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Feedbacks de sucesso nas configurações */}
      {sucessoVencimento && (
        <div className="flex items-center gap-2 rounded-xl bg-green-status/10 px-4 py-3 text-sm text-green-status">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {sucessoVencimento}
        </div>
      )}
      {sucessoForma && (
        <div className="flex items-center gap-2 rounded-xl bg-green-status/10 px-4 py-3 text-sm text-green-status">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          {sucessoForma}
        </div>
      )}

      {/* Sem cobranças */}
      {asaasAtivo && cobrancaAberta === null && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-6 rounded-[16px] shadow-sm">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-green-status mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <div>
              <p className="text-sm font-medium text-on-surface">Nenhuma cobrança em aberto</p>
              <p className="text-[12px] text-on-surface-variant/70 mt-0.5">Sua mensalidade está em dia. 🎉</p>
            </div>
          </div>
        </Card>
      )}

      {/* Sem integração Asaas */}
      {!asaasAtivo && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[22px] text-primary mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              info
            </span>
            <p className="text-[13px] text-on-surface-variant/80 leading-relaxed">
              Para solicitar segunda via de boleto, tirar dúvidas sobre cobranças ou alterar sua forma de pagamento,
              entre em contato com nosso escritório pelo chat ao lado ou pelo WhatsApp.
            </p>
          </div>
        </Card>
      )}

      {/* Histórico de cobranças */}
      {asaasAtivo && historico.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
          <div className="flex items-center gap-3 p-4 sm:px-6 sm:py-4 border-b border-outline-variant/10">
            <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>history</span>
            <h3 className="font-headline text-base font-semibold text-on-surface flex-1">Histórico de pagamentos</h3>
            <button
              onClick={baixarExtrato}
              disabled={baixandoExtrato}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-on-surface-variant hover:bg-surface-container/60 transition-colors disabled:opacity-50"
              title="Baixar extrato em CSV (compatível com Excel)"
            >
              {baixandoExtrato
                ? <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                : <span className="material-symbols-outlined text-[14px]">download</span>
              }
              {baixandoExtrato ? 'Gerando…' : 'Exportar CSV'}
            </button>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {historico.map(c => (
              <div key={c.id} className="flex flex-wrap items-center justify-between sm:justify-start gap-y-2 sm:gap-4 p-4 sm:px-6 sm:py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface">
                    {new Date(c.vencimento).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </p>
                  {c.pagoEm && (
                    <p className="text-[11px] text-green-status">
                      Pago em {new Date(c.pagoEm).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto basis-full sm:basis-auto mt-2 sm:mt-0 gap-3">
                  <span className="text-sm font-bold text-on-surface whitespace-nowrap">
                    {formatBRL(c.valorPago ?? c.valor)}
                  </span>
                  <span className={`rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-wider ${STATUS_COLOR[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  {/* Comprovante público — disponível quando Asaas gerou invoiceUrl */}
                  {c.invoiceUrl && c.status === 'RECEIVED' && (
                    <a
                      href={c.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                      title="Abrir comprovante de pagamento"
                    >
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      Comprovante
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Alerta procuração RF — exibido para MEI sem autorização ───────────── */}
      {regime === 'MEI' && !procuracaoRFAtiva && (
        <Link
          href="/portal/procuracao-rf"
          className="flex items-start gap-3.5 rounded-2xl border border-error/30 bg-error/8 px-5 py-4 transition-opacity hover:opacity-90"
        >
          <span
            className="material-symbols-outlined shrink-0 text-[22px] text-error mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            lock_person
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-error">Autorização Receita Federal pendente</p>
            <p className="mt-0.5 text-[12px] text-error/80 leading-relaxed">
              Você ainda não concedeu a procuração digital ao seu escritório. Sem ela, a DAS MEI não pode ser gerada automaticamente.{' '}
              <span className="font-semibold underline underline-offset-2">Clique aqui para ver como fazer</span>.
            </p>
          </div>
          <span className="material-symbols-outlined shrink-0 text-[18px] text-error/60 mt-0.5">chevron_right</span>
        </Link>
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
          variant="portal"
        />
      )}
      {regime === 'MEI' && limiteMeiErro && !limiteMei && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/40 mt-0.5 shrink-0">trending_up</span>
            <div>
              <p className="text-sm font-medium text-on-surface">Limite MEI indisponível</p>
              <p className="text-[12px] text-on-surface-variant/60 mt-0.5">
                Não foi possível carregar o faturamento acumulado. Tente recarregar a página.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ─── DAS MEI — exibido apenas para clientes MEI ───────────────────────── */}
      {regime === 'MEI' && (
        <div className="rounded-2xl border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/10">
            <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-headline text-base font-semibold text-on-surface">DAS MEI</h3>
              <p className="text-[11px] text-on-surface-variant/60">Documento de Arrecadação do Simples — MEI</p>
            </div>
          </div>

          {dasLoading && (
            <div className="flex items-center justify-center py-10">
              <span className="material-symbols-outlined animate-spin text-[24px] text-on-surface-variant/30">progress_activity</span>
            </div>
          )}

          {!dasLoading && dasErro && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="material-symbols-outlined text-[32px] text-error/50">error_outline</span>
              <p className="text-sm text-error/80">{dasErro}</p>
              <button
                type="button"
                onClick={carregarDASMEI}
                className="mt-1 text-[11px] text-primary underline underline-offset-2"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!dasLoading && !dasErro && !dasMeis.length && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-on-surface-variant/60">
              <span className="material-symbols-outlined text-[36px] opacity-30">receipt_long</span>
              <p className="text-sm">Nenhuma DAS disponível no momento.</p>
            </div>
          )}

          {!dasLoading && !dasErro && dasMeis.length > 0 && (
            <div className="divide-y divide-outline-variant/10">
              {dasMeis.map(das => (
                <div key={das.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-on-surface">
                        {formatarCompetencia(das.competencia)}
                      </span>
                      <span className={`rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-wider ${DAS_STATUS_COLOR[das.status]}`}>
                        {DAS_STATUS_LABEL[das.status]}
                      </span>
                    </div>
                    {das.dataVencimento && (
                      <p className="text-[11px] text-on-surface-variant/60 mt-0.5">
                        Venc.: {new Date(das.dataVencimento).toLocaleDateString('pt-BR')}
                        {das.valor != null && ` · ${formatBRL(das.valor)}`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Copiar código de barras */}
                    {das.codigoBarras && das.status !== 'paga' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(das.codigoBarras!)
                          setCopiandoDAS(das.id)
                          setTimeout(() => setCopiandoDAS(null), 2000)
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface px-3 py-1.5 text-[11px] font-medium text-on-surface transition-colors hover:bg-surface-container active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiandoDAS === das.id ? 'check' : 'content_copy'}
                        </span>
                        {copiandoDAS === das.id ? 'Copiado!' : 'Copiar código'}
                      </button>
                    )}
                    {/* Link da DAS */}
                    {das.urlDas && (
                      <a
                        href={das.urlDas}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[14px]">download</span>
                        Baixar DAS
                      </a>
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
