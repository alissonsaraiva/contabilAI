'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { StatusCliente } from '@prisma/client'
import { STATUS_CLIENTE_LABELS, STATUS_CLIENTE_COLORS } from '@/types'

// ── Tipos de transição ───────────────────────────────────────────────────────

type Acao = 'suspender' | 'cancelar' | 'reativar' | 'inadimplente'

interface TransicaoConfig {
  label:       string
  acao:        Acao
  endpoint:    string
  precisaMotivo: boolean
  descricao:   string
  corBotao:    string
}

const TRANSICOES: Record<StatusCliente, TransicaoConfig[]> = {
  ativo: [
    { label: 'Marcar inadimplente', acao: 'inadimplente', endpoint: '', precisaMotivo: false,
      descricao: 'O cliente continuará com acesso ao portal, mas ficará marcado como inadimplente.',
      corBotao: 'bg-orange-status/10 text-orange-status hover:bg-orange-status/20' },
    { label: 'Suspender acesso',    acao: 'suspender',    endpoint: 'suspender', precisaMotivo: true,
      descricao: 'Bloqueia o acesso ao portal imediatamente. Os dados são preservados.',
      corBotao: 'bg-error/10 text-error hover:bg-error/20' },
    { label: 'Cancelar contrato',   acao: 'cancelar',     endpoint: 'cancelar',  precisaMotivo: true,
      descricao: 'Cancela o contrato e bloqueia o acesso ao portal. Os dados são preservados.',
      corBotao: 'bg-error/10 text-error hover:bg-error/20' },
  ],
  inadimplente: [
    { label: 'Reativar',          acao: 'reativar',   endpoint: 'reativar',   precisaMotivo: false,
      descricao: 'Reativa o cliente e restaura o acesso ao portal.',
      corBotao: 'bg-green-status/10 text-green-status hover:bg-green-status/20' },
    { label: 'Suspender acesso',  acao: 'suspender',  endpoint: 'suspender',  precisaMotivo: true,
      descricao: 'Bloqueia o acesso ao portal imediatamente.',
      corBotao: 'bg-error/10 text-error hover:bg-error/20' },
    { label: 'Cancelar contrato', acao: 'cancelar',   endpoint: 'cancelar',   precisaMotivo: true,
      descricao: 'Cancela o contrato e bloqueia o acesso ao portal.',
      corBotao: 'bg-error/10 text-error hover:bg-error/20' },
  ],
  suspenso: [
    { label: 'Reativar',          acao: 'reativar',  endpoint: 'reativar',  precisaMotivo: false,
      descricao: 'Reativa o cliente e restaura o acesso ao portal.',
      corBotao: 'bg-green-status/10 text-green-status hover:bg-green-status/20' },
    { label: 'Cancelar contrato', acao: 'cancelar',  endpoint: 'cancelar',  precisaMotivo: true,
      descricao: 'Cancela o contrato definitivamente. Os dados são preservados.',
      corBotao: 'bg-error/10 text-error hover:bg-error/20' },
  ],
  cancelado: [
    { label: 'Reativar cliente',  acao: 'reativar',  endpoint: 'reativar',  precisaMotivo: false,
      descricao: 'Reativa o cliente e restaura o acesso ao portal.',
      corBotao: 'bg-green-status/10 text-green-status hover:bg-green-status/20' },
  ],
}

// ── Componente ───────────────────────────────────────────────────────────────

export function ClienteStatusSelect({
  clienteId,
  status,
}: {
  clienteId: string
  status:    StatusCliente
}) {
  const router  = useRouter()
  const [open, setOpen]     = useState(false)
  const [dialog, setDialog] = useState<TransicaoConfig | null>(null)
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  const transicoes = TRANSICOES[status] ?? []

  async function confirmar() {
    if (!dialog) return
    if (dialog.precisaMotivo && !motivo.trim()) {
      toast.error('Informe o motivo para continuar.')
      return
    }
    setLoading(true)
    try {
      // inadimplente usa PUT genérico (não precisa de motivo/histórico especial)
      if (dialog.acao === 'inadimplente') {
        const res = await fetch(`/api/clientes/${clienteId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: 'inadimplente' }),
        })
        if (!res.ok) throw new Error()
      } else {
        const res = await fetch(`/api/clientes/${clienteId}/${dialog.endpoint}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ motivo: motivo.trim() || undefined }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.detalhe ?? 'Erro ao atualizar status')
        }
      }
      toast.success('Status atualizado com sucesso.')
      setDialog(null)
      setMotivo('')
      setOpen(false)
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao atualizar status')
    } finally {
      setLoading(false)
    }
  }

  function abrirDialog(t: TransicaoConfig) {
    setMotivo('')
    setDialog(t)
    setOpen(false)
  }

  return (
    <>
      {/* ── Badge / trigger ──────────────────────────────────── */}
      <div className="relative">
        {transicoes.length > 0 ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80 ${STATUS_CLIENTE_COLORS[status]}`}
          >
            {STATUS_CLIENTE_LABELS[status]}
            <span className="material-symbols-outlined text-[13px]">expand_more</span>
          </button>
        ) : (
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLIENTE_COLORS[status]}`}>
            {STATUS_CLIENTE_LABELS[status]}
          </span>
        )}

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-20 mt-1.5 min-w-[200px] overflow-hidden rounded-[10px] border border-outline-variant/20 bg-card shadow-lg">
              {transicoes.map((t) => (
                <button
                  key={t.acao}
                  onClick={() => abrirDialog(t)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-[12px] font-medium transition-colors ${t.corBotao}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Dialog de confirmação ────────────────────────────── */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[440px] rounded-[16px] border border-outline-variant/20 bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 font-headline text-[17px] font-semibold text-on-surface">
              {dialog.label}
            </h2>
            <p className="mb-5 text-[13px] text-on-surface-variant">
              {dialog.descricao}
            </p>

            {dialog.precisaMotivo && (
              <div className="mb-5">
                <label className="mb-1.5 block text-[12px] font-semibold text-on-surface-variant">
                  Motivo <span className="text-error">*</span>
                </label>
                <textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Descreva o motivo..."
                  className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDialog(null); setMotivo('') }}
                disabled={loading}
                className="rounded-[10px] px-4 py-2 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={loading || (dialog.precisaMotivo && !motivo.trim())}
                className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border border-on-primary/30 border-t-on-primary" />
                    Aguarde...
                  </span>
                ) : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
