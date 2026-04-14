'use client'

import { useState, useEffect, useCallback } from 'react'
import * as Sentry from '@sentry/nextjs'
import { formatTimeShort } from '../helpers'
import { EmptyState } from '../EmptyState'
import type { ListaResumo } from './types'

export function ListasTab({
  onSelectLista,
  selectedListaId,
}: {
  onSelectLista: (lista: ListaResumo) => void
  selectedListaId: string | null
}) {
  const [listas, setListas]     = useState<ListaResumo[]>([])
  const [loading, setLoading]   = useState(true)
  const [criando, setCriando]   = useState(false)
  const [novoNome, setNovoNome] = useState('')

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/listas-transmissao')
      const data = await res.json()
      setListas(data.listas ?? [])
    } catch (err) {
      console.error('[listas-tab] erro ao carregar listas:', err)
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'carregar-listas' } })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  async function criarLista(e: React.FormEvent) {
    e.preventDefault()
    const nome = novoNome.trim()
    if (!nome) return

    setCriando(true)
    try {
      const res = await fetch('/api/crm/listas-transmissao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      })
      if (res.ok) {
        setNovoNome('')
        await carregar()
      }
    } catch (err) {
      console.error('[listas-tab] erro ao criar lista:', err)
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'criar-lista' } })
    } finally {
      setCriando(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Criar nova lista */}
      <form onSubmit={e => void criarLista(e)} className="border-b border-outline-variant/10 px-3 py-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[12px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Nome da nova lista..."
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            maxLength={100}
          />
          <button
            type="submit"
            disabled={!novoNome.trim() || criando}
            className="flex items-center gap-1.5 rounded-lg bg-[#25D366]/10 px-3 py-2 text-[12px] font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/20 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
            Criar
          </button>
        </div>
      </form>

      {/* Lista de listas */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <EmptyState icon="hourglass_top" text="Carregando..." />
        ) : listas.length === 0 ? (
          <EmptyState icon="campaign" text="Nenhuma lista criada" />
        ) : (
          listas.map(lista => (
            <ListaItem
              key={lista.id}
              lista={lista}
              isSelected={selectedListaId === lista.id}
              onSelect={() => onSelectLista(lista)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ListaItem({
  lista,
  isSelected,
  onSelect,
}: {
  lista: ListaResumo
  isSelected: boolean
  onSelect: () => void
}) {
  const statusLabel = lista.ultimoEnvio
    ? lista.ultimoEnvio.status === 'processando'
      ? '⏳ Enviando...'
      : lista.ultimoEnvio.status === 'concluido'
        ? `✓ ${lista.ultimoEnvio.totalEnviados}/${lista.ultimoEnvio.totalMembros}`
        : `✗ ${lista.ultimoEnvio.totalFalhas} falha(s)`
    : null

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-low ${
        isSelected ? 'bg-primary/5 border-l-2 border-primary' : ''
      }`}
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10">
        <span className="material-symbols-outlined text-[16px] text-[#25D366]" style={{ fontVariationSettings: "'FILL' 1" }}>
          campaign
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="flex-1 truncate text-[13px] font-semibold text-on-surface">{lista.nome}</p>
          <span className="shrink-0 text-[10px] text-on-surface-variant/40">
            {formatTimeShort(lista.atualizadaEm)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-on-surface-variant/60">
          {lista.totalMembros} membro{lista.totalMembros !== 1 ? 's' : ''}
        </p>
        {statusLabel && (
          <p className="mt-0.5 text-[10px] text-on-surface-variant/50">{statusLabel}</p>
        )}
      </div>
    </button>
  )
}
