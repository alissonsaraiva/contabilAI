'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { ListaDetalheData, EnvioResumo } from './types'
import { EmptyState } from '../EmptyState'
import { MembrosSection } from './MembrosSection'
import { EnviarSection } from './EnviarSection'
import { HistoricoSection } from './HistoricoSection'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function ListaDetalhe({
  listaId,
  onClose,
  onDeleted,
}: {
  listaId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [lista, setLista]             = useState<ListaDetalheData | null>(null)
  const [envios, setEnvios]           = useState<EnvioResumo[]>([])
  const [loading, setLoading]         = useState(true)
  const [editandoNome, setEditandoNome] = useState(false)
  const [nomeEdit, setNomeEdit]       = useState('')
  const [abaAtiva, setAbaAtiva]       = useState<'membros' | 'enviar' | 'historico'>('membros')
  const [confirmExcluir, setConfirmExcluir] = useState(false)
  const [excluindoLista, setExcluindoLista] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const carregar = useCallback(async () => {
    try {
      const [resLista, resEnvios] = await Promise.all([
        fetch(`/api/crm/listas-transmissao/${listaId}`),
        fetch(`/api/crm/listas-transmissao/${listaId}/envios`),
      ])
      if (resLista.ok) {
        const data = await resLista.json()
        setLista(data.lista)
        setNomeEdit(data.lista.nome)
      }
      if (resEnvios.ok) {
        const data = await resEnvios.json()
        setEnvios(data.envios ?? [])
      }
    } catch (err) {
      console.error('[lista-detalhe] erro ao carregar:', err)
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'carregar-detalhe' } })
    } finally {
      setLoading(false)
    }
  }, [listaId])

  useEffect(() => {
    void carregar()
    refreshTimerRef.current = setInterval(() => void carregar(), 10_000)
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current) }
  }, [carregar])

  async function renomear() {
    const nome = nomeEdit.trim()
    if (!nome || nome === lista?.nome) { setEditandoNome(false); return }
    try {
      await fetch(`/api/crm/listas-transmissao/${listaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome }),
      })
      setEditandoNome(false)
      await carregar()
    } catch (err) {
      console.error('[lista-detalhe] erro ao renomear:', err)
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'renomear' } })
    }
  }

  function excluirLista() {
    setConfirmExcluir(true)
  }

  async function handleConfirmExcluir() {
    setExcluindoLista(true)
    try {
      await fetch(`/api/crm/listas-transmissao/${listaId}`, { method: 'DELETE' })
      onDeleted()
    } catch (err) {
      console.error('[lista-detalhe] erro ao excluir:', err)
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'excluir' } })
    } finally {
      setExcluindoLista(false)
      setConfirmExcluir(false)
    }
  }

  async function removerMembro(membroId: string) {
    try {
      await fetch(`/api/crm/listas-transmissao/${listaId}/membros/${membroId}`, { method: 'DELETE' })
      await carregar()
    } catch (err) {
      console.error('[lista-detalhe] erro ao remover membro:', err)
      Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'remover-membro' } })
    }
  }

  if (loading) return <EmptyState icon="hourglass_top" text="Carregando..." />
  if (!lista) return <EmptyState icon="error" text="Lista não encontrada" />

  return (
    <>
    <ConfirmDialog
      open={confirmExcluir}
      onClose={() => setConfirmExcluir(false)}
      onConfirm={handleConfirmExcluir}
      title="Excluir lista de transmissão"
      description="Esta ação não pode ser desfeita. Todos os envios e histórico serão removidos."
      confirmLabel="Excluir"
      loading={excluindoLista}
    />
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-outline-variant/15 px-4 py-3">
        <button
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors lg:hidden"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10">
          <span className="material-symbols-outlined text-[16px] text-[#25D366]" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
        </div>

        {editandoNome ? (
          <form onSubmit={e => { e.preventDefault(); void renomear() }} className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              value={nomeEdit}
              onChange={e => setNomeEdit(e.target.value)}
              className="flex-1 rounded-lg border border-outline-variant/25 bg-surface-container-low px-3 py-1.5 text-[13px] text-on-surface focus:outline-none focus:ring-1 focus:ring-primary/30"
              maxLength={100}
              onBlur={() => void renomear()}
            />
          </form>
        ) : (
          <button
            onClick={() => setEditandoNome(true)}
            className="flex-1 text-left"
          >
            <p className="text-[14px] font-semibold text-on-surface">{lista.nome}</p>
            <p className="text-[11px] text-on-surface-variant/60">{lista.totalMembros} membro{lista.totalMembros !== 1 ? 's' : ''}</p>
          </button>
        )}

        <button
          onClick={excluirLista}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-error/60 hover:bg-error/10 transition-colors"
          title="Excluir lista"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>

      {/* Abas */}
      <div className="flex border-b border-outline-variant/10">
        {(['membros', 'enviar', 'historico'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setAbaAtiva(tab)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-colors ${
              abaAtiva === tab ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant/50 hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {tab === 'membros' ? 'group' : tab === 'enviar' ? 'send' : 'history'}
            </span>
            {tab === 'membros' ? 'Membros' : tab === 'enviar' ? 'Enviar' : 'Histórico'}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      <div className="flex-1 overflow-y-auto">
        {abaAtiva === 'membros' && (
          <MembrosSection
            listaId={listaId}
            membros={lista.membros}
            onRemover={id => void removerMembro(id)}
            onAdicionou={() => void carregar()}
          />
        )}
        {abaAtiva === 'enviar' && (
          <EnviarSection
            listaId={listaId}
            totalMembros={lista.totalMembros}
            onEnviou={() => { setAbaAtiva('historico'); void carregar() }}
          />
        )}
        {abaAtiva === 'historico' && <HistoricoSection envios={envios} />}
      </div>
    </div>
    </>
  )
}
