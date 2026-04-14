'use client'

import { useState, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { MembroLista } from './types'
import type { Contato } from '../types'
import { EmptyState } from '../EmptyState'

export function MembrosSection({
  listaId,
  membros,
  onRemover,
  onAdicionou,
}: {
  listaId: string
  membros: MembroLista[]
  onRemover: (id: string) => void
  onAdicionou: () => void
}) {
  const [buscando, setBuscando]       = useState(false)
  const [query, setQuery]             = useState('')
  const [resultados, setResultados]   = useState<Contato[]>([])
  const [adicionando, setAdicionando] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function buscar(q: string) {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) { setResultados([]); return }
    timerRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/crm/contatos?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        const lista: Contato[] = [
          ...(data.clientes ?? []).map((c: Record<string, unknown> & { id: string; nome: string; whatsapp?: string; telefone?: string; empresa?: { razaoSocial?: string } }) => ({
            id: c.id, nome: c.empresa?.razaoSocial ?? c.nome, whatsapp: c.whatsapp ?? null, telefone: c.telefone ?? null,
            tipo: 'cliente' as const, subtitulo: c.nome !== (c.empresa?.razaoSocial ?? c.nome) ? c.nome : 'Cliente',
          })),
          ...(data.socios ?? []).map((s: Record<string, unknown> & { id: string; nome: string; whatsapp?: string; telefone?: string; empresa?: { razaoSocial?: string; cliente?: { nome?: string } } }) => ({
            id: s.id, nome: s.nome, whatsapp: s.whatsapp ?? null, telefone: s.telefone ?? null,
            tipo: 'socio' as const, subtitulo: s.empresa?.razaoSocial ?? s.empresa?.cliente?.nome ?? 'Sócio',
          })),
        ]
        // Filtrar os que já são membros
        const idsCliente = new Set(membros.filter(m => m.clienteId).map(m => m.clienteId))
        const idsSocio   = new Set(membros.filter(m => m.socioId).map(m => m.socioId))
        setResultados(lista.filter(c =>
          c.tipo === 'cliente' ? !idsCliente.has(c.id) : !idsSocio.has(c.id)
        ))
      } catch (err) {
        console.error('[lista-membros] erro ao buscar contatos:', err)
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, 300)
  }

  async function adicionar(contato: Contato) {
    const key = `${contato.tipo}-${contato.id}`
    if (adicionando.has(key)) return
    setAdicionando(prev => new Set(prev).add(key))
    try {
      const membro = contato.tipo === 'cliente'
        ? { clienteId: contato.id }
        : { socioId: contato.id }
      await fetch(`/api/crm/listas-transmissao/${listaId}/membros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membros: [membro] }),
      })
      setResultados(prev => prev.filter(c => `${c.tipo}-${c.id}` !== key))
      onAdicionou()
    } catch (err) {
      console.error('[lista-membros] erro ao adicionar:', err)
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'adicionar-membro' } })
    } finally {
      setAdicionando(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  return (
    <div className="px-4 py-3">
      {/* Busca para adicionar */}
      <div className="mb-3">
        <div className="flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">person_add</span>
          <input
            className="flex-1 bg-transparent text-[12px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
            placeholder="Buscar cliente ou sócio para adicionar..."
            value={query}
            onChange={e => { setQuery(e.target.value); buscar(e.target.value) }}
          />
          {buscando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-surface-variant/20 border-t-on-surface-variant/60" />}
        </div>

        {/* Resultados da busca */}
        {resultados.length > 0 && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-outline-variant/10 bg-card">
            {resultados.map(c => {
              const temWhatsApp = !!(c.whatsapp || c.telefone)
              const cKey = `${c.tipo}-${c.id}`
              return (
                <button
                  key={cKey}
                  onClick={() => void adicionar(c)}
                  disabled={!temWhatsApp || adicionando.has(cKey)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-container-low disabled:opacity-40"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container">
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {c.tipo === 'socio' ? 'badge' : 'business'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-on-surface">{c.nome}</p>
                    <p className="text-[10px] text-on-surface-variant/50">
                      {c.subtitulo}{temWhatsApp ? ` · ${c.whatsapp || c.telefone}` : ' · sem WhatsApp'}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-[#25D366]">add_circle</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista de membros atuais */}
      <div className="mb-2 flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
          Membros ({membros.length}/50)
        </p>
      </div>

      {membros.length === 0 ? (
        <EmptyState icon="group_off" text="Nenhum membro adicionado" />
      ) : (
        <div className="space-y-1">
          {membros.map(m => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-container-low"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container">
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {m.tipo === 'socio' ? 'badge' : 'business'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-on-surface">{m.nome}</p>
                <p className="text-[10px] text-on-surface-variant/50">
                  {m.empresa ?? (m.tipo === 'socio' ? 'Sócio' : 'Cliente')}
                  {m.whatsapp ? ` · ${m.whatsapp}` : ' · sem número'}
                </p>
              </div>
              {!m.whatsapp && (
                <span className="rounded-full bg-orange-status/10 px-1.5 text-[9px] font-semibold text-orange-status">sem nº</span>
              )}
              <button
                onClick={() => onRemover(m.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-error/40 hover:bg-error/10 hover:text-error transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">remove_circle</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
