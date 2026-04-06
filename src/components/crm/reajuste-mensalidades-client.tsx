'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatBRL } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type ClienteRow = {
  id:          string
  nome:        string
  valorMensal: number
  status:      string
  temAsaas:    boolean
}

type ResultadoReajuste = {
  total:         number
  atualizados:   number
  semAsaas:      number
  erros:         number
  detalhesErros: Array<{ clienteId: string; nome: string; erro: string }>
}

type Props = {
  rows:          ClienteRow[]
  totalAtual:    number
  totalComAsaas: number
  totalSemAsaas: number
}

const ETAPA = {
  CONFIGURAR:  'configurar',
  PREVIEW:     'preview',
  EXECUTANDO:  'executando',
  RESULTADO:   'resultado',
} as const
type Etapa = typeof ETAPA[keyof typeof ETAPA]

export function ReajusteMensalidadesClient({ rows, totalAtual, totalComAsaas, totalSemAsaas }: Props) {
  const router = useRouter()
  const [etapa, setEtapa] = useState<Etapa>(ETAPA.CONFIGURAR)
  const [percentualStr, setPercentualStr] = useState('')
  const [erroInput, setErroInput] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoReajuste | null>(null)
  const [erroExecucao, setErroExecucao] = useState<string | null>(null)
  const [retryLoading, setRetryLoading] = useState(false)

  const percentual = parseFloat(percentualStr.replace(',', '.'))
  const percentualValido = !isNaN(percentual) && percentual !== 0 && percentual >= -99 && percentual <= 500

  // Preview calculado localmente para mostrar antes de executar
  const preview = useMemo(() => {
    if (!percentualValido) return null
    const novoTotal = rows.reduce((s, r) => {
      const novoValor = Math.max(1, Math.round(r.valorMensal * (1 + percentual / 100) * 100) / 100)
      return s + novoValor
    }, 0)
    return { novoTotal, variacao: novoTotal - totalAtual }
  }, [percentualValido, percentual, rows, totalAtual])

  async function retryErros() {
    if (!resultado || resultado.detalhesErros.length === 0) return
    const ids = resultado.detalhesErros.map(e => e.clienteId)
    setRetryLoading(true)
    try {
      const res = await fetch('/api/crm/financeiro/reajuste-mensalidades', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ percentual, clienteIds: ids }),
        signal:  AbortSignal.timeout(110_000),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao reprocessar.')
      // Merge: atualiza o resultado somando os que agora foram bem-sucedidos
      const novoResultado: ResultadoReajuste = {
        total:         resultado.total,
        atualizados:   resultado.atualizados + (body.atualizados ?? 0),
        semAsaas:      resultado.semAsaas    + (body.semAsaas    ?? 0),
        erros:         body.erros ?? 0,
        detalhesErros: body.detalhesErros ?? [],
      }
      setResultado(novoResultado)
    } catch (err) {
      const msg = err instanceof Error && err.name === 'TimeoutError'
        ? 'Tempo limite excedido ao reprocessar.'
        : (err instanceof Error ? err.message : 'Erro inesperado.')
      setErroExecucao(msg)
    } finally {
      setRetryLoading(false)
    }
  }

  function validarEAvancar() {
    setErroInput(null)
    if (percentualStr.trim() === '') {
      setErroInput('Informe o percentual de reajuste.')
      return
    }
    if (isNaN(percentual)) {
      setErroInput('Percentual inválido. Use um número (ex: 5 para +5%, -10 para -10%).')
      return
    }
    if (percentual === 0) {
      setErroInput('O percentual não pode ser zero.')
      return
    }
    if (percentual < -99 || percentual > 500) {
      setErroInput('Percentual fora do intervalo permitido (-99% a +500%).')
      return
    }
    setEtapa(ETAPA.PREVIEW)
  }

  async function confirmarEExecutar() {
    setEtapa(ETAPA.EXECUTANDO)
    setErroExecucao(null)
    try {
      const res = await fetch('/api/crm/financeiro/reajuste-mensalidades', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ percentual }),
        // 110s — ligeiramente abaixo do maxDuration=120 da rota para garantir feedback de erro
        signal:  AbortSignal.timeout(110_000),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Erro ao executar reajuste.')
      setResultado(body as ResultadoReajuste)
      setEtapa(ETAPA.RESULTADO)
    } catch (err) {
      const msg = err instanceof Error && err.name === 'TimeoutError'
        ? 'Tempo limite excedido. O reajuste pode ter sido parcialmente aplicado — verifique os clientes individualmente.'
        : (err instanceof Error ? err.message : 'Erro inesperado.')
      setErroExecucao(msg)
      setEtapa(ETAPA.PREVIEW)
    }
  }

  // ─── Etapa: Configurar ───────────────────────────────────────────────────────
  if (etapa === ETAPA.CONFIGURAR) {
    return (
      <div className="space-y-6 max-w-2xl">

        {/* Cards de resumo */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
            <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Clientes elegíveis</p>
            <p className="mt-1 text-2xl font-bold text-on-surface">{rows.length}</p>
            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">ativo + inadimplente</p>
          </Card>
          <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
            <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Total atual/mês</p>
            <p className="mt-1 text-2xl font-bold text-on-surface">{formatBRL(totalAtual)}</p>
            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">soma das mensalidades</p>
          </Card>
          <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
            <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Integração Asaas</p>
            <p className="mt-1 text-2xl font-bold text-on-surface">{totalComAsaas}</p>
            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">{totalSemAsaas} sem Asaas</p>
          </Card>
        </div>

        {/* Formulário */}
        <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-outline-variant/10">
            <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>percent</span>
            <h3 className="font-headline text-base font-semibold text-on-surface">Configurar reajuste</h3>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-on-surface">
                Percentual de reajuste
              </label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="number"
                    step={0.1}
                    value={percentualStr}
                    onChange={e => { setPercentualStr(e.target.value); setErroInput(null) }}
                    placeholder="ex: 5"
                    className="h-10 w-32 rounded-xl border border-outline-variant/30 bg-surface px-3 pr-8 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-on-surface-variant/60">%</span>
                </div>
                {percentualValido && preview && (
                  <div className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold ${percentual > 0 ? 'bg-green-status/10 text-green-status' : 'bg-orange-status/10 text-orange-status'}`}>
                    <span className="material-symbols-outlined text-[16px]">
                      {percentual > 0 ? 'trending_up' : 'trending_down'}
                    </span>
                    {percentual > 0 ? '+' : ''}{percentual.toFixed(1)}% → {formatBRL(preview.novoTotal)}/mês
                    <span className="text-[11px] font-normal opacity-70">
                      ({percentual > 0 ? '+' : ''}{formatBRL(preview.variacao)})
                    </span>
                  </div>
                )}
              </div>
              {erroInput && (
                <p className="text-[12px] text-error">{erroInput}</p>
              )}
              <p className="text-[12px] text-on-surface-variant/60">
                Use valores positivos para reajuste (ex: 5 para +5%) ou negativos para desconto (ex: -10 para -10%).
                Valor mínimo resultante por cliente: R$ 1,00.
              </p>
            </div>

            {percentual < 0 && percentualValido && (
              <div className="flex items-start gap-2 rounded-xl bg-orange-status/10 px-4 py-3 text-[12px] text-orange-status">
                <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">warning</span>
                <span>Você está aplicando um <strong>desconto</strong> de {Math.abs(percentual).toFixed(1)}%. Confirme que é intencional na próxima etapa.</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={validarEAvancar} disabled={!percentualStr.trim()}>
                Ver preview
                <span className="material-symbols-outlined text-[16px] ml-1.5">arrow_forward</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Tabela de clientes */}
        <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-outline-variant/10">
            <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
            <h3 className="font-headline text-base font-semibold text-on-surface">Clientes elegíveis</h3>
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-[1px] text-[10px] font-bold text-primary">{rows.length}</span>
          </div>
          <div className="divide-y divide-outline-variant/10 max-h-96 overflow-y-auto">
            {rows.map(r => {
              const novoValor = percentualValido
                ? Math.max(1, Math.round(r.valorMensal * (1 + percentual / 100) * 100) / 100)
                : null
              return (
                <div key={r.id} className="flex items-center gap-4 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{r.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold uppercase ${r.status === 'inadimplente' ? 'text-error' : 'text-green-status'}`}>
                        {r.status}
                      </span>
                      {!r.temAsaas && (
                        <span className="text-[10px] text-on-surface-variant/50">sem Asaas</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-on-surface">{formatBRL(r.valorMensal)}</p>
                    {novoValor !== null && novoValor !== r.valorMensal && (
                      <p className={`text-[11px] font-medium ${percentual > 0 ? 'text-green-status' : 'text-orange-status'}`}>
                        → {formatBRL(novoValor)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─── Etapa: Preview (confirmação) ────────────────────────────────────────────
  if (etapa === ETAPA.PREVIEW) {
    const novoTotal = preview?.novoTotal ?? 0
    const variacao  = preview?.variacao ?? 0

    return (
      <div className="space-y-6 max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-outline-variant/10 bg-orange-status/5">
            <span className="material-symbols-outlined text-[20px] text-orange-status" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <h3 className="font-headline text-base font-semibold text-on-surface">Confirmar reajuste</h3>
          </div>

          <div className="p-6 space-y-5">
            {erroExecucao && (
              <div className="flex items-center gap-2 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
                <span className="material-symbols-outlined text-[16px]">error</span>
                {erroExecucao}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-surface-container/50 p-4">
                <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Percentual</p>
                <p className={`mt-1 text-2xl font-bold ${percentual > 0 ? 'text-green-status' : 'text-orange-status'}`}>
                  {percentual > 0 ? '+' : ''}{percentual.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl bg-surface-container/50 p-4">
                <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Clientes afetados</p>
                <p className="mt-1 text-2xl font-bold text-on-surface">{rows.length}</p>
              </div>
              <div className="rounded-xl bg-surface-container/50 p-4">
                <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Total atual/mês</p>
                <p className="mt-1 text-lg font-bold text-on-surface">{formatBRL(totalAtual)}</p>
              </div>
              <div className="rounded-xl bg-surface-container/50 p-4">
                <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Novo total/mês</p>
                <p className={`mt-1 text-lg font-bold ${percentual > 0 ? 'text-green-status' : 'text-orange-status'}`}>
                  {formatBRL(novoTotal)}
                  <span className="text-[12px] font-normal ml-1 opacity-70">
                    ({percentual > 0 ? '+' : ''}{formatBRL(variacao)})
                  </span>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-outline-variant/20 bg-surface-container/30 px-4 py-3 text-[12px] text-on-surface-variant space-y-1">
              <p>• <strong>{totalComAsaas}</strong> clientes com Asaas — mensalidade e cobranças em aberto serão atualizadas.</p>
              <p>• <strong>{totalSemAsaas}</strong> clientes sem Asaas — apenas o banco será atualizado.</p>
              <p>• Cobranças já <strong>pagas</strong> não são alteradas.</p>
              <p>• Valor mínimo por cliente após reajuste: <strong>R$ 1,00</strong>.</p>
              <p>• Esta operação <strong>não pode ser desfeita automaticamente</strong>.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setEtapa(ETAPA.CONFIGURAR)}
              >
                Voltar
              </Button>
              <Button
                onClick={confirmarEExecutar}
                className="bg-orange-status hover:bg-orange-status/90 text-white"
              >
                <span className="material-symbols-outlined text-[16px] mr-1.5">check_circle</span>
                Confirmar e executar reajuste
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Etapa: Executando ───────────────────────────────────────────────────────
  if (etapa === ETAPA.EXECUTANDO) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <span className="material-symbols-outlined animate-spin text-[48px] text-primary/60">progress_activity</span>
        <div>
          <p className="text-base font-semibold text-on-surface">Executando reajuste…</p>
          <p className="text-sm text-on-surface-variant/60 mt-1">
            Atualizando {rows.length} clientes no Asaas. Isso pode levar alguns instantes.
          </p>
        </div>
      </div>
    )
  }

  // ─── Etapa: Resultado ────────────────────────────────────────────────────────
  if (etapa === ETAPA.RESULTADO && resultado) {
    const temErros = resultado.erros > 0

    return (
      <div className="space-y-6 max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
          <div className={`flex items-center gap-3 px-6 py-4 border-b border-outline-variant/10 ${temErros ? 'bg-orange-status/5' : 'bg-green-status/5'}`}>
            <span className={`material-symbols-outlined text-[20px] ${temErros ? 'text-orange-status' : 'text-green-status'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
              {temErros ? 'warning' : 'check_circle'}
            </span>
            <h3 className="font-headline text-base font-semibold text-on-surface">
              {temErros ? 'Reajuste concluído com alertas' : 'Reajuste concluído com sucesso'}
            </h3>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl bg-surface-container/50 p-4 text-center">
                <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Total</p>
                <p className="mt-1 text-2xl font-bold text-on-surface">{resultado.total}</p>
              </div>
              <div className="rounded-xl bg-green-status/10 p-4 text-center">
                <p className="text-[11px] font-medium text-green-status/80 uppercase tracking-wider">Atualizados</p>
                <p className="mt-1 text-2xl font-bold text-green-status">{resultado.atualizados}</p>
              </div>
              <div className="rounded-xl bg-surface-container/50 p-4 text-center">
                <p className="text-[11px] font-medium text-on-surface-variant/70 uppercase tracking-wider">Sem Asaas</p>
                <p className="mt-1 text-2xl font-bold text-on-surface">{resultado.semAsaas}</p>
              </div>
              {temErros ? (
                <div className="rounded-xl bg-error/10 p-4 text-center">
                  <p className="text-[11px] font-medium text-error/80 uppercase tracking-wider">Erros</p>
                  <p className="mt-1 text-2xl font-bold text-error">{resultado.erros}</p>
                </div>
              ) : (
                <div className="rounded-xl bg-green-status/10 p-4 text-center">
                  <p className="text-[11px] font-medium text-green-status/80 uppercase tracking-wider">Erros</p>
                  <p className="mt-1 text-2xl font-bold text-green-status">0</p>
                </div>
              )}
            </div>

            {temErros && resultado.detalhesErros.length > 0 && (
              <div className="rounded-xl border border-error/20 bg-error/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] font-semibold text-error">
                    Clientes com erro ({resultado.detalhesErros.length}) — não atualizados:
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={retryErros}
                    disabled={retryLoading}
                    className="text-[11px] gap-1.5 border-error/30 text-error hover:bg-error/10 shrink-0"
                  >
                    <span className={`material-symbols-outlined text-[13px] ${retryLoading ? 'animate-spin' : ''}`}>
                      {retryLoading ? 'progress_activity' : 'refresh'}
                    </span>
                    {retryLoading ? 'Reprocessando…' : `Tentar novamente (${resultado.detalhesErros.length})`}
                  </Button>
                </div>
                {erroExecucao && (
                  <p className="text-[11px] text-error">{erroExecucao}</p>
                )}
                <div className="space-y-1.5">
                  {resultado.detalhesErros.map((e, i) => (
                    <div key={i} className="text-[12px] text-on-surface-variant">
                      <span className="font-medium text-on-surface">{e.nome}</span>
                      <span className="text-on-surface-variant/60"> — {e.erro}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  // Recarrega os dados do servidor para refletir os novos valores no preview
                  router.refresh()
                  setEtapa(ETAPA.CONFIGURAR)
                  setPercentualStr('')
                  setResultado(null)
                }}
              >
                Novo reajuste
              </Button>
              <Button onClick={() => router.push('/crm/financeiro/inadimplentes')}>
                Ver inadimplentes
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
