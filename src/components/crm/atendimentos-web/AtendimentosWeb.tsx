'use client'

import { useState } from 'react'
import Link from 'next/link'
import { WhatsAppChatPanel } from '../whatsapp-chat-panel'
import { PortalConversaPanel } from '../portal-conversa-panel'
import { AutoRefresh } from '@/components/ui/auto-refresh'
import type { ConversaWebItem, EscalacaoWebItem, SelectedConversation, FilterTab, SelectAction } from './types'
import { getApiPath, getNome } from './helpers'
import { ConversaSection } from './ConversaList'
import { EscalacoesSection } from './EscalacoesSection'
import { NovaConversaSheet } from './NovaConversaSheet'
import { EmptyState } from './EmptyState'

export function AtendimentosWeb({
  aguardandoResposta,
  emAtendimentoHumano,
  ativasIA,
  escalacoesPendentes,
  escalacaoEmAtendimento,
  emailsPendentes,
  truncado = false,
  totalConversas24h = 0,
}: {
  aguardandoResposta:     ConversaWebItem[]
  emAtendimentoHumano:    ConversaWebItem[]
  ativasIA:               ConversaWebItem[]
  escalacoesPendentes:    EscalacaoWebItem[]
  escalacaoEmAtendimento: EscalacaoWebItem[]
  emailsPendentes:        number
  truncado?:              boolean
  totalConversas24h?:     number
}) {
  const [selected, setSelected]       = useState<SelectedConversation | null>(null)
  const [novaConversa, setNovaConversa] = useState(false)
  const [filtro, setFiltro]           = useState<FilterTab>('todas')
  const [busca, setBusca]             = useState('')

  function handleSelect(c: ConversaWebItem) {
    if (c.canal === 'portal') {
      setSelected({ type: 'portal', conversaId: c.id, nome: getNome(c), clienteId: c.cliente?.id })
      return
    }
    const apiPath = getApiPath(c) ?? `/api/conversas/${c.id}`
    setSelected({ type: 'whatsapp', apiPath, nome: getNome(c) })
  }

  function filterByBusca(list: ConversaWebItem[]) {
    if (!busca.trim()) return list
    const q = busca.toLowerCase()
    return list.filter(c => getNome(c).toLowerCase().includes(q))
  }

  const aguardando = (filtro === 'todas' || filtro === 'urgentes') ? filterByBusca(aguardandoResposta) : []
  const humano     = (filtro === 'todas' || filtro === 'voce')     ? filterByBusca(emAtendimentoHumano) : []
  const ia         = (filtro === 'todas' || filtro === 'ia')       ? filterByBusca(ativasIA) : []

  const totalConversas  = aguardandoResposta.length + emAtendimentoHumano.length + ativasIA.length
  const totalEscalacoes = escalacoesPendentes.length + escalacaoEmAtendimento.length
  const semResultados   = aguardando.length === 0 && humano.length === 0 && ia.length === 0

  async function handleNovaConversaSelect(action: SelectAction) {
    setNovaConversa(false)
    if (action.canal === 'whatsapp') {
      setSelected({ type: 'whatsapp', apiPath: action.apiPath, nome: action.nome })
    } else {
      try {
        const res  = await fetch(`/api/crm/clientes/${action.clienteId}/portal-chat`)
        const data = await res.json()
        const conversas = data.conversas ?? []
        if (conversas.length > 0) {
          setSelected({ type: 'portal', conversaId: conversas[0].id, nome: action.nome })
        } else {
          alert(`${action.nome} ainda não tem conversa ativa pelo portal.`)
        }
      } catch (err: unknown) {
        console.error('[atendimentos-web] erro ao buscar conversa portal:', { clienteId: action.clienteId, err })
        alert('Erro ao buscar conversa do portal.')
      }
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <AutoRefresh intervalMs={30_000} />

      {/* ─── Painel esquerdo ─────────────────────────────────────────── */}
      <div className={`flex shrink-0 flex-col overflow-hidden border-r border-outline-variant/15 bg-card w-full lg:w-80 ${selected ? 'hidden lg:flex' : 'flex'}`}>

        {/* Header */}
        <div className="flex items-center gap-2 border-b border-outline-variant/15 px-4 py-3">
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-on-surface">Conversas</p>
            <p className="text-[11px] text-on-surface-variant/60">{totalConversas} ativas (24h)</p>
          </div>
          {totalEscalacoes > 0 && (
            <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-bold text-error">
              {totalEscalacoes} esc.
            </span>
          )}
          <button
            onClick={() => setNovaConversa(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#25D366]/10 px-3 py-1.5 text-[12px] font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/20"
          >
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_comment</span>
            Nova
          </button>
        </div>

        {/* Banner de truncamento */}
        {truncado && (
          <div className="flex items-center gap-2 border-b border-orange-status/15 bg-orange-status/5 px-4 py-2">
            <span className="material-symbols-outlined text-[14px] text-orange-status shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
            <p className="text-[11px] text-orange-status/90 leading-snug">
              Exibindo 100 de {totalConversas24h} conversas. Recarregue para ver as mais recentes.
            </p>
          </div>
        )}

        {/* Banner de emails */}
        {emailsPendentes > 0 && (
          <Link
            href="/crm/emails"
            className="flex items-center gap-3 border-b border-primary/10 bg-primary/5 px-4 py-2.5 transition-colors hover:bg-primary/10"
          >
            <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
            <p className="flex-1 text-[12px] font-medium text-primary">
              {emailsPendentes} e-mail{emailsPendentes > 1 ? 's' : ''} aguardando resposta
            </p>
            <span className="material-symbols-outlined text-[14px] text-primary/60">chevron_right</span>
          </Link>
        )}

        {/* Busca */}
        <div className="border-b border-outline-variant/10 px-3 py-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-1.5">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">search</span>
            <input
              className="flex-1 bg-transparent text-[12px] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none"
              placeholder="Buscar conversa..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            {busca && (
              <button onClick={() => setBusca('')} className="flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant/40 hover:text-on-surface-variant transition-colors">
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Abas de filtro */}
        <div className="flex gap-0.5 border-b border-outline-variant/10 px-3 py-1.5">
          {(['todas', 'urgentes', 'voce', 'ia'] as FilterTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setFiltro(tab)}
              className={`relative flex flex-1 items-center justify-center gap-1 rounded-md py-2 text-[11px] font-semibold transition-colors ${
                filtro === tab
                  ? 'bg-primary/10 text-primary'
                  : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              {tab === 'todas' ? 'Todas' : tab === 'urgentes' ? 'Urgentes' : tab === 'voce' ? 'Você' : 'IA'}
              {tab === 'urgentes' && aguardandoResposta.length > 0 && (
                <span className="rounded-full bg-error/20 px-1 text-[9px] text-error">{aguardandoResposta.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Lista de conversas */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {semResultados ? (
            <EmptyState icon="chat_bubble" text={busca ? 'Nenhuma conversa encontrada' : 'Sem conversas ativas'} />
          ) : (
            <>
              {aguardando.length > 0 && (
                <ConversaSection titulo="Aguardando resposta" corTitulo="text-error/70" items={aguardando} urgente selected={selected} onSelect={handleSelect} />
              )}
              {humano.length > 0 && (
                <ConversaSection titulo="Em atendimento (você)" corTitulo="text-orange-status/70" items={humano} selected={selected} onSelect={handleSelect} />
              )}
              {ia.length > 0 && (
                <ConversaSection titulo="Atendidas pela IA" corTitulo="text-on-surface-variant/50" items={ia} selected={selected} onSelect={handleSelect} />
              )}
            </>
          )}

          <EscalacoesSection pendentes={escalacoesPendentes} emAtendimento={escalacaoEmAtendimento} />
        </div>
      </div>

      {/* ─── Painel direito ──────────────────────────────────────────── */}
      <div className={`flex-col overflow-hidden bg-surface-container-low ${selected ? 'flex flex-1' : 'hidden lg:flex lg:flex-1'}`}>
        {selected ? (
          selected.type === 'portal' ? (
            <PortalConversaPanel
              key={selected.conversaId}
              conversaId={selected.conversaId}
              nomeExibido={selected.nome}
              clienteId={selected.clienteId}
              onClose={() => setSelected(null)}
            />
          ) : (
            <WhatsAppChatPanel
              key={selected.apiPath}
              apiPath={selected.apiPath}
              nomeExibido={selected.nome}
              onClose={() => setSelected(null)}
            />
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-sm">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/25" style={{ fontVariationSettings: "'FILL' 1" }}>forum</span>
            </div>
            <div>
              <p className="text-[14px] font-medium text-on-surface-variant/60">Nenhuma conversa selecionada</p>
              <p className="mt-1 text-[12px] text-on-surface-variant/30">Selecione uma conversa para abrir o chat</p>
            </div>
            <button
              onClick={() => setNovaConversa(true)}
              className="mt-2 flex items-center gap-2 rounded-xl bg-[#25D366]/10 px-5 py-2.5 text-[13px] font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/20"
            >
              <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>add_comment</span>
              Nova mensagem
            </button>
          </div>
        )}
      </div>

      <NovaConversaSheet open={novaConversa} onClose={() => setNovaConversa(false)} onSelect={handleNovaConversaSelect} />
    </div>
  )
}
