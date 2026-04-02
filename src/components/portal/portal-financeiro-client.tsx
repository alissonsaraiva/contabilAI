'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatBRL } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
}

type CobrancaHistorico = {
  id: string
  valor: number
  vencimento: string
  status: CobrancaStatus
  formaPagamento: 'pix' | 'boleto'
  pagoEm: string | null
  valorPago: number | null
}

const STATUS_LABEL: Record<CobrancaStatus, string> = {
  PENDING: 'Em aberto',
  RECEIVED: 'Pago',
  OVERDUE: 'Vencido',
  REFUNDED: 'Reembolsado',
  CANCELLED: 'Cancelado',
}

const STATUS_COLOR: Record<CobrancaStatus, string> = {
  PENDING: 'bg-primary/10 text-primary',
  RECEIVED: 'bg-green-status/10 text-green-status',
  OVERDUE: 'bg-error/10 text-error',
  REFUNDED: 'bg-surface-container text-on-surface-variant',
  CANCELLED: 'bg-surface-container text-on-surface-variant',
}

type Props = {
  clienteId: string
  valorMensal: number
  vencimentoDia: number
  formaPagamento: string
  asaasAtivo: boolean
}

export function PortalFinanceiroClient({ clienteId, valorMensal, vencimentoDia, formaPagamento, asaasAtivo }: Props) {
  const [cobrancaAberta, setCobrancaAberta] = useState<CobrancaAberta | null | undefined>(undefined)
  const [historico, setHistorico] = useState<CobrancaHistorico[]>([])
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState(false)
  const [segundaViaLoading, setSegundaViaLoading] = useState(false)
  const [segundaVia, setSegundaVia] = useState<CobrancaAberta | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [abertaRes, historicoRes] = await Promise.all([
        fetch('/api/portal/financeiro/cobranca-aberta'),
        fetch('/api/portal/financeiro/cobrancas'),
      ])
      if (abertaRes.ok) setCobrancaAberta(await abertaRes.json())
      if (historicoRes.ok) setHistorico(await historicoRes.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregarDados() }, [carregarDados])

  function pixExpirado(cob: CobrancaAberta): boolean {
    if (!cob.pixCopiaECola || !cob.atualizadoEm) return false
    return (Date.now() - new Date(cob.atualizadoEm).getTime()) > 20 * 3600 * 1000
  }

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function gerarSegundaVia(cobrancaId: string) {
    setSegundaViaLoading(true)
    setErro(null)
    try {
      const res = await fetch('/api/portal/financeiro/segunda-via', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cobrancaId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao gerar segunda via.')
      setSegundaVia(body)
      await carregarDados()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar segunda via.')
    } finally {
      setSegundaViaLoading(false)
    }
  }

  const FORMA_LABELS: Record<string, string> = {
    boleto: 'Boleto bancário',
    pix: 'PIX',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="material-symbols-outlined animate-spin text-[24px] text-on-surface-variant/40">progress_activity</span>
      </div>
    )
  }

  // Exibe segunda via gerada ao invés da original
  const cobrancaExibida = segundaVia ?? cobrancaAberta

  return (
    <div className="space-y-6">

      {/* Resumo da mensalidade */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-green-status/10">
            <span className="material-symbols-outlined text-[22px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Mensalidade</p>
          <p className="text-xl font-bold text-on-surface mt-1">{formatBRL(valorMensal)}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>event_repeat</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Dia de vencimento</p>
          <p className="text-xl font-bold text-on-surface mt-1">Todo dia {vencimentoDia}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-4 sm:p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[22px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>credit_card</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Forma de pagamento</p>
          <p className="text-[15px] font-bold text-on-surface mt-1">
            {FORMA_LABELS[formaPagamento] ?? formaPagamento}
          </p>
        </Card>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-2 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {erro}
        </div>
      )}

      {/* Cobrança em aberto */}
      {asaasAtivo && cobrancaExibida && (
        <Card className="border-outline-variant/15 bg-card shadow-sm overflow-hidden rounded-[16px]">
          <div className={`p-4 sm:px-6 sm:py-4 border-b border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${cobrancaExibida.status === 'OVERDUE' ? 'bg-error/5' : ''}`}>
            <div className="flex items-center gap-3">
              <span
                className={`material-symbols-outlined text-[20px] ${cobrancaExibida.status === 'OVERDUE' ? 'text-error' : 'text-primary'}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {cobrancaExibida.status === 'OVERDUE' ? 'warning' : 'receipt'}
              </span>
              <div>
                <h3 className="font-headline text-base font-semibold text-on-surface">
                  {cobrancaExibida.status === 'OVERDUE' ? 'Cobrança vencida' : 'Cobrança atual'}
                </h3>
                <p className="text-[12px] text-on-surface-variant/70">
                  Vencimento: {new Date(cobrancaExibida.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="sm:text-right flex sm:block items-center justify-between">
              <p className="text-xl font-bold text-on-surface">{formatBRL(cobrancaExibida.valor)}</p>
              <span className={`text-[10px] font-bold uppercase px-2 py-[1px] rounded-full ${STATUS_COLOR[cobrancaExibida.status]}`}>
                {STATUS_LABEL[cobrancaExibida.status]}
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            {/* PIX expirado */}
            {cobrancaExibida.formaPagamento === 'pix' && pixExpirado(cobrancaExibida) && (
              <div className="flex items-start gap-2 rounded-xl bg-orange-50 px-4 py-3 text-sm text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">
                <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">warning</span>
                <span>O código PIX pode estar expirado. Gere uma segunda via para obter um novo código atualizado.</span>
              </div>
            )}

            {/* PIX válido */}
            {cobrancaExibida.formaPagamento === 'pix' && cobrancaExibida.pixCopiaECola && !pixExpirado(cobrancaExibida) && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  {cobrancaExibida.pixQrCode && (
                    <img
                      src={`data:image/png;base64,${cobrancaExibida.pixQrCode}`}
                      alt="QR Code PIX"
                      className="h-36 w-36 shrink-0 rounded-xl border border-outline-variant/20 shadow-sm"
                    />
                  )}
                  <div className="flex-1 space-y-2 min-w-0">
                    <p className="text-[13px] text-on-surface-variant/80 leading-relaxed">
                      Abra o app do seu banco, acesse a área PIX e escaneie o QR Code ou cole o código abaixo.
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container/50 px-3 py-2">
                        <p className="truncate text-[11px] font-mono text-on-surface-variant">
                          {cobrancaExibida.pixCopiaECola.slice(0, 50)}…
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => copiar(cobrancaExibida!.pixCopiaECola!)}
                        className="shrink-0 gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiado ? 'check' : 'content_copy'}
                        </span>
                        {copiado ? 'Copiado!' : 'Copiar PIX'}
                      </Button>
                    </div>
                    {copiado && (
                      <p className="text-[11px] text-on-surface-variant/60">
                        Após efetuar o pagamento, a confirmação pode levar alguns minutos.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Boleto */}
            {cobrancaExibida.formaPagamento === 'boleto' && (
              <div className="space-y-3">
                <p className="text-[13px] text-on-surface-variant/80">
                  Pague o boleto bancário no seu banco, lotérica ou pelo app do banco.
                </p>
                <div className="flex flex-wrap gap-2">
                  {cobrancaExibida.linkBoleto && (
                    <a
                      href={cobrancaExibida.linkBoleto}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-on-primary shadow-sm hover:bg-primary/90 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                      Abrir boleto
                    </a>
                  )}
                  {cobrancaExibida.codigoBarras && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copiar(cobrancaExibida!.codigoBarras!)}
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
            {(cobrancaExibida.status === 'OVERDUE' || (cobrancaExibida.status === 'PENDING' && pixExpirado(cobrancaExibida))) && !segundaVia && (
              <div className="border-t border-outline-variant/10 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => gerarSegundaVia(cobrancaExibida.id)}
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

      {/* Sem cobranças */}
      {asaasAtivo && cobrancaExibida === null && (
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
            <h3 className="font-headline text-base font-semibold text-on-surface">Histórico de pagamentos</h3>
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
