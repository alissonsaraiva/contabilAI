'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

type NotaFiscal = {
  id: string
  numero: string | null
  status: string
  descricao: string
  valorTotal: number
  issValor: number | null
  tomadorNome: string
  protocolo: string | null
  spedyId: string | null
  autorizadaEm: string | null
  criadoEm: string
}

const STATUS_LABELS: Record<string, string> = {
  autorizada:  'Autorizada',
  cancelada:   'Cancelada',
  processando: 'Processando',
  enviando:    'Enviando',
}

const STATUS_COLORS: Record<string, string> = {
  autorizada:  'bg-green-500/10 text-green-600',
  cancelada:   'bg-gray-100 text-gray-500',
  processando: 'bg-blue-500/10 text-blue-600',
  enviando:    'bg-purple-500/10 text-purple-600',
}

const STATUS_ICONS: Record<string, string> = {
  autorizada:  'check_circle',
  cancelada:   'remove_circle',
  processando: 'hourglass_empty',
  enviando:    'upload',
}

type Props = { clienteId: string }

export function PortalNotasFiscaisClient({ clienteId }: Props) {
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mesFiltro, setMesFiltro] = useState<string>('')

  const fetchNotas = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (mesFiltro) params.set('mes', mesFiltro)
      const res = await fetch(`/api/portal/notas-fiscais?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNotas(data.items ?? [])
      setTotal(data.total ?? 0)
    } catch {
      toast.error('Erro ao carregar notas fiscais')
    } finally {
      setLoading(false)
    }
  }, [mesFiltro])

  useEffect(() => { fetchNotas() }, [fetchNotas])

  // Gera opções de mês dos últimos 12 meses
  const mesesOpcoes = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = format(d, 'MMMM/yyyy', { locale: ptBR })
    return { value, label }
  })

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={mesFiltro}
          onChange={e => setMesFiltro(e.target.value)}
          className="h-10 rounded-xl border border-outline-variant/20 bg-card px-3 text-[13px] text-on-surface shadow-sm focus:outline-none"
        >
          <option value="">Todos os meses</option>
          {mesesOpcoes.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : notas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/30 py-16 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/30">receipt_long</span>
          <p className="text-[14px] text-on-surface-variant/60">
            {mesFiltro ? 'Nenhuma nota encontrada para o período selecionado' : 'Nenhuma nota fiscal emitida ainda'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-on-surface-variant/60">
            {total} nota{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </p>
          {notas.map(nota => {
            const statusColor = STATUS_COLORS[nota.status] ?? 'bg-gray-100 text-gray-500'
            const statusLabel = STATUS_LABELS[nota.status] ?? nota.status
            const statusIcon  = STATUS_ICONS[nota.status] ?? 'help'
            const dataRef     = nota.autorizadaEm ?? nota.criadoEm
            const dataFmt     = format(new Date(dataRef), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
            const valorFmt    = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`

            return (
              <div key={nota.id} className="rounded-2xl border border-outline-variant/15 bg-card p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8">
                    <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                      receipt_long
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-bold text-on-surface">
                        {nota.numero ? `NFS-e nº ${nota.numero}` : 'NFS-e (em processamento)'}
                      </span>
                      <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColor}`}>
                        <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>{statusIcon}</span>
                        {statusLabel}
                      </span>
                    </div>

                    <p className="mt-1 text-[13px] text-on-surface-variant/70">{nota.descricao}</p>

                    <div className="mt-2 flex items-center gap-4 flex-wrap">
                      <span className="text-[15px] font-bold text-on-surface">{valorFmt}</span>
                      <span className="text-[12px] text-on-surface-variant/60">{dataFmt}</span>
                    </div>

                    {nota.protocolo && (
                      <p className="mt-1 text-[11px] text-on-surface-variant/40 font-mono">
                        Protocolo: {nota.protocolo}
                      </p>
                    )}
                  </div>

                  {/* Ação: baixar PDF */}
                  {nota.status === 'autorizada' && nota.spedyId && (
                    <a
                      href={`/api/portal/notas-fiscais/${nota.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[12px] font-semibold text-on-surface transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      PDF
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex gap-3">
          <span className="material-symbols-outlined text-[18px] text-blue-500 shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
          <div className="text-[12px] text-on-surface-variant/80 space-y-1">
            <p>Suas notas fiscais são emitidas pelo escritório em seu nome.</p>
            <p>Precisa de uma NFS-e específica ou tem dúvidas? Fale com nossa assistente no chat.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
