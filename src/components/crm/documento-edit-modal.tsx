'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { CATEGORIAS_DOCUMENTO, STATUS_DOCUMENTO_OPTIONS } from '@/lib/services/documento-categorias'

export type DocumentoEditavel = {
  id: string
  nome: string
  tipo: string
  categoria: string | null
  status: string
  observacao?: string | null
  visivelPortal: boolean
  dataVencimento?: string | Date | null
}

type Props = {
  documento: DocumentoEditavel
  onClose: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSaved: (updated: any) => void
}

const STATUS_OPTIONS = STATUS_DOCUMENTO_OPTIONS

const INPUT = 'h-9 w-full rounded-[10px] border border-outline-variant/60 bg-surface-container px-3 text-[13px] text-on-surface focus:border-primary/70 focus:outline-none focus:ring-[3px] focus:ring-primary/15 placeholder:text-on-surface-variant/60'
const SELECT = INPUT + ' appearance-none cursor-pointer pr-8'
const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70'

export function DocumentoEditModal({ documento, onClose, onSaved }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const [nome, setNome] = useState(documento.nome)
  const [tipo, setTipo] = useState(documento.tipo)
  const [categoria, setCategoria] = useState(documento.categoria ?? 'geral')
  const [status, setStatus] = useState(documento.status)
  const [observacao, setObservacao] = useState(documento.observacao ?? '')
  const [visivelPortal, setVisivelPortal] = useState(documento.visivelPortal)
  const [dataVencimento, setDataVencimento] = useState(
    documento.dataVencimento ? new Date(documento.dataVencimento).toISOString().split('T')[0] : '',
  )
  const [salvando, setSalvando] = useState(false)

  async function handleSave() {
    if (!nome.trim()) { toast.error('Preencha o nome do documento para continuar.'); return }
    setSalvando(true)
    try {
      const res = await fetch(`/api/crm/documentos/${documento.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(), tipo: tipo.trim(), categoria, status,
          observacao: observacao.trim(), visivelPortal,
          dataVencimento: dataVencimento || null,
        }),
      })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      toast.success('Documento atualizado.')
      onSaved(updated)
    } catch {
      toast.error('Não foi possível salvar as alterações. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-outline-variant/20 bg-surface shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/15 px-6 py-4">
          <h3 className="text-[15px] font-semibold text-on-surface">Editar Documento</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className={LABEL}>Nome do arquivo</label>
            <input className={INPUT + ' mt-1'} value={nome} onChange={e => setNome(e.target.value)} />
          </div>

          <div>
            <label className={LABEL}>Tipo / Descrição</label>
            <input className={INPUT + ' mt-1'} value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Ex: Guia DAS, Nota Fiscal..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Categoria</label>
              <div className="relative mt-1">
                <select className={SELECT} value={categoria} onChange={e => setCategoria(e.target.value)}>
                  {CATEGORIAS_DOCUMENTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/60">expand_more</span>
              </div>
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <div className="relative mt-1">
                <select className={SELECT} value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[13px] text-on-surface-variant/60">expand_more</span>
              </div>
            </div>
          </div>

          {visivelPortal && (
            <div>
              <label className={LABEL}>Data de vencimento</label>
              <input
                type="date"
                className={INPUT + ' mt-1'}
                value={dataVencimento}
                onChange={e => setDataVencimento(e.target.value)}
              />
              {dataVencimento && (
                <button
                  type="button"
                  onClick={() => setDataVencimento('')}
                  className="mt-1 text-[11px] text-on-surface-variant/60 hover:text-error transition-colors"
                >
                  Remover vencimento
                </button>
              )}
            </div>
          )}

          <div>
            <label className={LABEL}>Observação</label>
            <textarea
              className={INPUT + ' mt-1 h-20 resize-none py-2'}
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder="Observação interna (opcional)..."
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={visivelPortal}
              onChange={e => { setVisivelPortal(e.target.checked); if (!e.target.checked) setDataVencimento('') }}
              className="h-4 w-4 rounded border-outline-variant/60 text-primary focus:ring-primary/30"
            />
            <span className="text-[13px] text-on-surface">Disponibilizar no portal do cliente</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-outline-variant/15 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {salvando && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
