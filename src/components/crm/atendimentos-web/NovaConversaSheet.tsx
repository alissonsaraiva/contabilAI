'use client'

import { useState, useCallback, useRef } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { SelectAction, Contato } from './types'
import { EmptyState } from './EmptyState'

export function NovaConversaSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (action: SelectAction) => void
}) {
  const [query, setQuery]           = useState('')
  const [resultados, setResultados] = useState<Contato[]>([])
  const [buscando, setBuscando]     = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buscar = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) { setResultados([]); return }
    timerRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const res  = await fetch(`/api/crm/contatos?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        const lista: Contato[] = [
          ...(data.clientes ?? []).map((c: any) => ({
            id:        c.id,
            nome:      c.empresa?.razaoSocial ?? c.nome,
            whatsapp:  c.whatsapp,
            telefone:  c.telefone,
            tipo:      'cliente' as const,
            subtitulo: c.nome !== (c.empresa?.razaoSocial ?? c.nome) ? c.nome : 'Cliente',
          })),
          ...(data.socios ?? []).map((s: any) => ({
            id:        s.id,
            nome:      s.nome,
            whatsapp:  s.whatsapp,
            telefone:  s.telefone,
            tipo:      'socio' as const,
            subtitulo: s.empresa?.razaoSocial ?? s.empresa?.cliente?.nome ?? 'Sócio',
          })),
        ]
        setResultados(lista)
      } catch {
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, 300)
  }, [])

  function handleWhatsApp(c: Contato) {
    const apiPath = c.tipo === 'socio'
      ? `/api/socios/${c.id}/whatsapp`
      : `/api/clientes/${c.id}/whatsapp`
    onSelect({ canal: 'whatsapp', apiPath, nome: c.nome })
  }

  function handlePortal(c: Contato) {
    onSelect({ canal: 'portal', clienteId: c.id, nome: c.nome })
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-sm flex-col gap-0 p-0" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              add_comment
            </span>
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-on-surface">Nova mensagem</p>
            <p className="text-[11px] text-on-surface-variant">Busque um cliente ou sócio</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Busca */}
        <div className="px-4 pb-2 pt-4">
          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2.5">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50">search</span>
            <input
              autoFocus
              className="flex-1 bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
              placeholder="Nome da empresa, cliente ou sócio..."
              value={query}
              onChange={e => { setQuery(e.target.value); buscar(e.target.value) }}
            />
            {buscando && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/20 border-t-on-surface-variant/60" />
            )}
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {query.length < 2 ? (
            <EmptyState icon="contacts" text="Digite pelo menos 2 caracteres para buscar" />
          ) : resultados.length === 0 && !buscando ? (
            <EmptyState icon="person_search" text="Nenhum contato encontrado" />
          ) : (
            <div className="space-y-2 pt-2">
              {resultados.map(c => (
                <ContatoCard
                  key={`${c.tipo}-${c.id}`}
                  contato={c}
                  onWhatsApp={() => handleWhatsApp(c)}
                  onPortal={() => handlePortal(c)}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Card de contato ─────────────────────────────────────────────────────────

function ContatoCard({
  contato: c,
  onWhatsApp,
  onPortal,
}: {
  contato: Contato
  onWhatsApp: () => void
  onPortal: () => void
}) {
  const temWhatsApp = !!(c.whatsapp || c.telefone)
  const temPortal   = c.tipo === 'cliente'

  return (
    <div className="rounded-xl border border-outline-variant/10 bg-card p-3.5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-container">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>
            {c.tipo === 'socio' ? 'badge' : 'business'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-on-surface">{c.nome}</p>
          <p className="text-[11px] text-on-surface-variant/60">
            {c.subtitulo}{temWhatsApp ? ` · ${c.whatsapp || c.telefone}` : ''}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onWhatsApp}
          disabled={!temWhatsApp}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors enabled:bg-[#25D366]/10 enabled:text-[#25D366] enabled:hover:bg-[#25D366]/20 disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface-variant/30"
        >
          <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: temWhatsApp ? "'FILL' 1" : "'FILL' 0" }}>
            chat_bubble
          </span>
          WhatsApp
        </button>
        {temPortal && (
          <button
            onClick={onPortal}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-[12px] font-semibold text-violet-500 transition-colors hover:bg-violet-500/20"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
            Portal
          </button>
        )}
      </div>
    </div>
  )
}
