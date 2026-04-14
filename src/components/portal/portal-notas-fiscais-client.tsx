'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { type NotaFiscal } from './notas-fiscais/_shared'
import { PortalNotaCard } from './notas-fiscais/nota-card'
import { ModalEmitir }   from './notas-fiscais/modal-emitir'
import { ModalCancelar } from './notas-fiscais/modal-cancelar'
import { ModalReemitir } from './notas-fiscais/modal-reemitir'

type Props = {
  spedyConfigurado: boolean
  prestador: { razaoSocial: string; cnpj: string }
}

export function PortalNotasFiscaisClient({ spedyConfigurado, prestador }: Props) {
  const [notas, setNotas]         = useState<NotaFiscal[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [mesFiltro, setMesFiltro] = useState<string>('')

  const [showEmitir, setShowEmitir]     = useState(false)
  const [showCancelar, setShowCancelar] = useState<NotaFiscal | null>(null)
  const [showReemitir, setShowReemitir] = useState<NotaFiscal | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchNotas = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const params = new URLSearchParams()
      if (mesFiltro) params.set('mes', mesFiltro)
      const res = await fetch(`/api/portal/notas-fiscais?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNotas(data.items ?? [])
      setTotal(data.total ?? 0)
      setPage(1)
    } catch {
      if (!silencioso) toast.error('Não foi possível carregar suas notas. Tente recarregar a página.')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [mesFiltro])

  async function carregarMais() {
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const params = new URLSearchParams({ page: String(nextPage) })
      if (mesFiltro) params.set('mes', mesFiltro)
      const res = await fetch(`/api/portal/notas-fiscais?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNotas(prev => [...prev, ...(data.items ?? [])])
      setPage(nextPage)
    } catch {
      toast.error('Não foi possível carregar mais notas. Tente novamente.')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => { void fetchNotas() }, [fetchNotas])

  // Polling automático enquanto houver notas em processamento
  useEffect(() => {
    const temAtivas = notas.some(n => n.status === 'enviando' || n.status === 'processando')
    if (!temAtivas) return
    const timer = setInterval(() => fetchNotas(true), 6000)
    return () => clearInterval(timer)
  }, [notas, fetchNotas])

  // ── Filtro de mês ────────────────────────────────────────────────────────────

  const mesesOpcoes = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = format(d, 'MMMM/yyyy', { locale: ptBR })
    return { value, label }
  })

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header com filtro e botão de emissão */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        {spedyConfigurado && (
          <button
            onClick={() => setShowEmitir(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Emitir NFS-e
          </button>
        )}
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
            {mesFiltro ? 'Nenhuma nota encontrada nesse período.' : 'Você ainda não emitiu nenhuma nota fiscal.'}
          </p>
          {spedyConfigurado && !mesFiltro && (
            <button
              onClick={() => setShowEmitir(true)}
              className="mt-1 flex items-center gap-1.5 rounded-xl border border-primary/30 px-4 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              Emitir primeira NFS-e
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-on-surface-variant/60">
            {total} nota{total !== 1 ? 's' : ''} encontrada{total !== 1 ? 's' : ''}
          </p>
          {notas.map(nota => (
            <PortalNotaCard
              key={nota.id}
              nota={nota}
              spedyConfigurado={spedyConfigurado}
              onCancelar={() => setShowCancelar(nota)}
              onReemitir={() => setShowReemitir(nota)}
            />
          ))}

          {notas.length < total && (
            <button
              onClick={carregarMais}
              disabled={loadingMore}
              className="w-full rounded-xl border border-outline-variant/20 bg-card py-3 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              {loadingMore
                ? <span className="flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Carregando...</span>
                : `Carregar mais (${total - notas.length} restantes)`
              }
            </button>
          )}
        </div>
      )}

      {/* Banner: Spedy não configurado */}
      {!spedyConfigurado && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex gap-3">
            <span className="material-symbols-outlined text-[18px] text-blue-500 shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
            <p className="text-[12px] text-on-surface-variant/80">
              As notas fiscais são emitidas pelo escritório. Precisa de uma NFS-e ou tem dúvidas? Fale conosco pelo suporte.
            </p>
          </div>
        </div>
      )}

      {/* Modais */}
      {showEmitir && (
        <ModalEmitir
          prestador={prestador}
          onClose={() => setShowEmitir(false)}
          onSuccess={() => { setShowEmitir(false); void fetchNotas() }}
        />
      )}

      {showCancelar && (
        <ModalCancelar
          nota={showCancelar}
          onClose={() => setShowCancelar(null)}
          onSuccess={() => { setShowCancelar(null); void fetchNotas() }}
        />
      )}

      {showReemitir && (
        <ModalReemitir
          nota={showReemitir}
          onClose={() => setShowReemitir(null)}
          onSuccess={() => { setShowReemitir(null); void fetchNotas() }}
        />
      )}
    </div>
  )
}
