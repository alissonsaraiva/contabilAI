'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { WhatsAppChatPanel } from './whatsapp-chat-panel'
import { PortalConversaPanel } from './portal-conversa-panel'
import { Sheet, SheetContent } from '@/components/ui/sheet'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ConversaWebItem = {
  id: string
  canal: string
  pausadaEm: string | null
  ultimaMensagemEm: string | null
  atualizadaEm: string
  remoteJid: string | null
  socioId: string | null
  cliente: { id: string; nome: string } | null
  lead: { id: string; contatoEntrada: string; dadosJson: unknown } | null
  mensagens: { conteudo: string; role: string }[]
}

export type EscalacaoWebItem = {
  id: string
  canal: string
  ultimaMensagem: string
  motivoIA: string | null
  criadoEm: string
  status: string
}

type SelectedConversation =
  | { type: 'whatsapp'; apiPath: string; nome: string }
  | { type: 'portal';   conversaId: string; nome: string }

type FilterTab = 'todas' | 'urgentes' | 'voce' | 'ia'

type SelectAction =
  | { canal: 'whatsapp'; apiPath: string; nome: string }
  | { canal: 'portal'; clienteId: string; nome: string }

type Contato = {
  id: string
  nome: string
  whatsapp: string | null
  telefone: string | null
  tipo: 'cliente' | 'socio'
  subtitulo: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApiPath(c: ConversaWebItem): string | null {
  if (c.canal !== 'whatsapp') return null        // portal/onboarding não usam WhatsApp drawer
  if (c.socioId) return `/api/socios/${c.socioId}/whatsapp`
  if (c.cliente)  return `/api/clientes/${c.cliente.id}/whatsapp`
  if (c.lead)     return `/api/leads/${c.lead.id}/whatsapp`
  return null
}

function getNome(c: ConversaWebItem): string {
  return (
    c.cliente?.nome ??
    ((c.lead?.dadosJson as any)?.nomeCompleto as string | undefined) ??
    ((c.lead?.dadosJson as any)?.nome as string | undefined) ??
    c.lead?.contatoEntrada ??
    c.remoteJid?.replace('@s.whatsapp.net', '') ??
    'Desconhecido'
  )
}

function getInitials(nome: string): string {
  return nome
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatTimeShort(dateStr: string): string {
  const d    = new Date(dateStr)
  const now  = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000)      return 'agora'
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000)  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ─── Layout principal ─────────────────────────────────────────────────────────

export function AtendimentosWeb({
  aguardandoResposta,
  emAtendimentoHumano,
  ativasIA,
  escalacoesPendentes,
  escalacaoEmAtendimento,
  emailsPendentes,
}: {
  aguardandoResposta:     ConversaWebItem[]
  emAtendimentoHumano:    ConversaWebItem[]
  ativasIA:               ConversaWebItem[]
  escalacoesPendentes:    EscalacaoWebItem[]
  escalacaoEmAtendimento: EscalacaoWebItem[]
  emailsPendentes:        number
}) {
  const [selected, setSelected]     = useState<SelectedConversation | null>(null)
  const [novaConversa, setNovaConversa] = useState(false)
  const [filtro, setFiltro]         = useState<FilterTab>('todas')
  const [busca, setBusca]           = useState('')
  const router = useRouter()

  // ── Auto-refresh da lista a cada 30s quando o tab está visível ───────────────
  // router.refresh() re-executa os server components (page.tsx) mas preserva
  // todo o estado React deste client component — chat aberto, filtro, busca.
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh()
    }
    // Atualiza quando o tab volta a ficar visível (ex: operador volta de outra aba)
    document.addEventListener('visibilitychange', tick)
    // Polling de 30s para manter a lista sincronizada
    const id = setInterval(tick, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', tick)
      clearInterval(id)
    }
  }, [router])
  // ─────────────────────────────────────────────────────────────────────────────

  function handleSelect(c: ConversaWebItem) {
    if (c.canal === 'portal') {
      setSelected({ type: 'portal', conversaId: c.id, nome: getNome(c) })
      return
    }
    // WhatsApp: usa apiPath da entidade vinculada; sem entidade, cai no endpoint por conversaId
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
      {/* ─── Painel esquerdo — full width no mobile, 320px fixo no desktop ── */}
      <div className={`flex shrink-0 flex-col overflow-hidden border-r border-outline-variant/15 bg-card w-full lg:w-80 ${selected ? 'hidden lg:flex' : 'flex'}`}>

        {/* Header do painel */}
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
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              add_comment
            </span>
            Nova
          </button>
        </div>

        {/* Banner de emails pendentes */}
        {emailsPendentes > 0 && (
          <Link
            href="/crm/emails"
            className="flex items-center gap-3 border-b border-primary/10 bg-primary/5 px-4 py-2.5 transition-colors hover:bg-primary/10"
          >
            <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              mail
            </span>
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
              {tab === 'todas'    ? 'Todas' :
               tab === 'urgentes' ? 'Urgentes' :
               tab === 'voce'     ? 'Você' : 'IA'}
              {tab === 'urgentes' && aguardandoResposta.length > 0 && (
                <span className="rounded-full bg-error/20 px-1 text-[9px] text-error">
                  {aguardandoResposta.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Lista de conversas (scrollable) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {semResultados ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/20">chat_bubble</span>
              <p className="text-[12px] text-on-surface-variant/50">
                {busca ? 'Nenhuma conversa encontrada' : 'Sem conversas ativas'}
              </p>
            </div>
          ) : (
            <>
              {aguardando.length > 0 && (
                <ConversaSection
                  titulo="Aguardando resposta"
                  corTitulo="text-error/70"
                  items={aguardando}
                  urgente
                  selected={selected}
                  onSelect={handleSelect}
                />
              )}
              {humano.length > 0 && (
                <ConversaSection
                  titulo="Em atendimento (você)"
                  corTitulo="text-orange-status/70"
                  items={humano}
                  selected={selected}
                  onSelect={handleSelect}
                />
              )}
              {ia.length > 0 && (
                <ConversaSection
                  titulo="Atendidas pela IA"
                  corTitulo="text-on-surface-variant/50"
                  items={ia}
                  selected={selected}
                  onSelect={handleSelect}
                />
              )}
            </>
          )}

          {/* Escalações */}
          {(escalacoesPendentes.length > 0 || escalacaoEmAtendimento.length > 0) && (
            <div className="mt-1 border-t border-outline-variant/10">
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="material-symbols-outlined text-[13px] text-error" style={{ fontVariationSettings: "'FILL' 1" }}>
                  escalator_warning
                </span>
                <p className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
                  Escalações
                </p>
                <span className="rounded-full bg-error/10 px-1.5 text-[10px] font-bold text-error">
                  {escalacoesPendentes.length + escalacaoEmAtendimento.length}
                </span>
              </div>
              {[...escalacoesPendentes, ...escalacaoEmAtendimento].map(esc => (
                <Link
                  key={esc.id}
                  href={`/crm/atendimentos/${esc.id}`}
                  className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-container"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="flex-1 truncate text-[12px] font-medium text-on-surface">{esc.ultimaMensagem}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        esc.status === 'pendente'
                          ? 'bg-error/10 text-error'
                          : 'bg-orange-status/10 text-orange-status'
                      }`}>
                        {esc.status === 'pendente' ? 'pendente' : 'andamento'}
                      </span>
                    </div>
                    {esc.motivoIA && (
                      <p className="mt-0.5 truncate text-[11px] text-on-surface-variant/50">{esc.motivoIA}</p>
                    )}
                  </div>
                  <span className="material-symbols-outlined mt-0.5 shrink-0 text-[14px] text-on-surface-variant/30">
                    chevron_right
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Painel direito — oculto no mobile até conversa ser selecionada ── */}
      <div className={`flex-col overflow-hidden bg-surface-container-low ${selected ? 'flex flex-1' : 'hidden lg:flex lg:flex-1'}`}>
        {selected ? (
          selected.type === 'portal' ? (
            <PortalConversaPanel
              key={selected.conversaId}
              conversaId={selected.conversaId}
              nomeExibido={selected.nome}
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
              <span
                className="material-symbols-outlined text-[32px] text-on-surface-variant/25"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                forum
              </span>
            </div>
            <div>
              <p className="text-[14px] font-medium text-on-surface-variant/60">Nenhuma conversa selecionada</p>
              <p className="mt-1 text-[12px] text-on-surface-variant/30">
                Selecione uma conversa para abrir o chat
              </p>
            </div>
            <button
              onClick={() => setNovaConversa(true)}
              className="mt-2 flex items-center gap-2 rounded-xl bg-[#25D366]/10 px-5 py-2.5 text-[13px] font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/20"
            >
              <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                add_comment
              </span>
              Nova mensagem
            </button>
          </div>
        )}
      </div>

      {/* Sheet: Nova conversa */}
      <NovaConversaSheet
        open={novaConversa}
        onClose={() => setNovaConversa(false)}
        onSelect={handleNovaConversaSelect}
      />
    </div>
  )
}

// ─── Seção de conversas ───────────────────────────────────────────────────────

function ConversaSection({
  titulo,
  corTitulo,
  items,
  urgente,
  selected,
  onSelect,
}: {
  titulo: string
  corTitulo: string
  items: ConversaWebItem[]
  urgente?: boolean
  selected: SelectedConversation | null
  onSelect: (c: ConversaWebItem) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <p className={`flex-1 text-[11px] font-semibold uppercase tracking-wider ${corTitulo}`}>{titulo}</p>
        <span className={`rounded-full px-1.5 text-[10px] font-bold ${
          urgente ? 'bg-error/10 text-error' : 'bg-surface-container text-on-surface-variant'
        }`}>
          {items.length}
        </span>
      </div>
      {items.map(c => (
        <ConversaItem
          key={c.id}
          c={c}
          urgente={urgente}
          isSelected={
            c.canal === 'portal'
              ? selected?.type === 'portal' && selected.conversaId === c.id
              : selected?.type === 'whatsapp' && selected.apiPath === (getApiPath(c) ?? `/api/conversas/${c.id}`)
          }
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

// ─── Item de conversa ─────────────────────────────────────────────────────────

function ConversaItem({
  c,
  urgente,
  isSelected,
  onSelect,
}: {
  c: ConversaWebItem
  urgente?: boolean
  isSelected?: boolean
  onSelect: (c: ConversaWebItem) => void
}) {
  const nome           = getNome(c)
  const initials       = getInitials(nome)
  const ultimaMensagem = c.mensagens[0]

  return (
    <button
      onClick={() => onSelect(c)}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-low ${
        isSelected ? 'bg-primary/5 border-l-2 border-primary' : ''
      } ${urgente && !isSelected ? 'border-l-2 border-error' : ''}`}
    >
      {/* Avatar */}
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
        urgente ? 'bg-error/15 text-error' : 'bg-surface-container text-on-surface-variant'
      }`}>
        {initials}
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="flex-1 truncate text-[13px] font-semibold text-on-surface">{nome}</p>
          <span className="shrink-0 text-[10px] text-on-surface-variant/40">
            {formatTimeShort(c.atualizadaEm)}
          </span>
        </div>
        {ultimaMensagem && (
          <p className={`mt-0.5 truncate text-[11px] leading-relaxed ${urgente ? 'font-medium text-on-surface' : 'text-on-surface-variant/60'}`}>
            {ultimaMensagem.role === 'assistant' && (
              <span className="text-on-surface-variant/40">IA: </span>
            )}
            {ultimaMensagem.conteudo}
          </p>
        )}
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`text-[10px] font-medium ${
            c.canal === 'whatsapp' ? 'text-[#25D366]' :
            c.canal === 'portal'   ? 'text-violet-500' : 'text-blue-500'
          }`}>
            {c.canal === 'whatsapp' ? 'WhatsApp' : c.canal === 'portal' ? 'Portal' : 'Site'}
          </span>
          {urgente ? (
            <span className="rounded-full bg-error/10 px-1.5 text-[10px] font-semibold text-error">nova msg</span>
          ) : c.pausadaEm ? (
            <span className="rounded-full bg-orange-status/10 px-1.5 text-[10px] font-semibold text-orange-status">humano</span>
          ) : (
            <span className="rounded-full bg-green-status/10 px-1.5 text-[10px] font-semibold text-green-status">IA</span>
          )}
        </div>
      </div>

      {/* Indicador de não lida */}
      {urgente && (
        <div className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-error" />
      )}
    </button>
  )
}

// ─── Sheet: Nova conversa ─────────────────────────────────────────────────────

function NovaConversaSheet({
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
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/20">contacts</span>
              <p className="text-[13px] text-on-surface-variant/50">Digite pelo menos 2 caracteres para buscar</p>
            </div>
          ) : resultados.length === 0 && !buscando ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/20">person_search</span>
              <p className="text-[13px] text-on-surface-variant/50">Nenhum contato encontrado</p>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              {resultados.map(c => {
                const temWhatsApp = !!(c.whatsapp || c.telefone)
                const temPortal   = c.tipo === 'cliente'
                return (
                  <div key={`${c.tipo}-${c.id}`} className="rounded-xl border border-outline-variant/10 bg-card p-3.5">
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
                        onClick={() => handleWhatsApp(c)}
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
                          onClick={() => handlePortal(c)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-[12px] font-semibold text-violet-500 transition-colors hover:bg-violet-500/20"
                        >
                          <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                          Portal
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
