'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { WhatsAppDrawer } from './whatsapp-drawer'
import { Sheet, SheetContent } from '@/components/ui/sheet'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ConversaGridItem = {
  id: string
  canal: string
  pausadaEm: string | null        // ISO string — serializado do server component
  ultimaMensagemEm: string | null
  atualizadaEm: string
  remoteJid: string | null
  socioId: string | null
  cliente: { id: string; nome: string } | null
  lead:    { id: string; contatoEntrada: string; dadosJson: unknown } | null
  mensagens: { conteudo: string; role: string }[]
}

type DrawerState = { apiPath: string; nome: string } | null

const CANAL_ICON: Record<string, string> = {
  whatsapp:   'forum',
  onboarding: 'language',
  portal:     'person',
}
const CANAL_LABEL: Record<string, string> = {
  whatsapp:   'WhatsApp',
  onboarding: 'Site',
  portal:     'Portal',
}
const CANAL_COLOR: Record<string, string> = {
  whatsapp:   'text-green-600',
  onboarding: 'text-blue-500',
  portal:     'text-violet-500',
}

// ─── Grid principal ──────────────────────────────────────────────────────────

export function AtendimentosGrid({
  aguardandoResposta,
  emAtendimentoHumano,
  ativasIA,
}: {
  aguardandoResposta:  ConversaGridItem[]
  emAtendimentoHumano: ConversaGridItem[]
  ativasIA:            ConversaGridItem[]
}) {
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [novaConversa, setNovaConversa] = useState(false)

  function openDrawer(c: ConversaGridItem) {
    const apiPath = c.socioId
      ? `/api/socios/${c.socioId}/whatsapp`
      : c.cliente
        ? `/api/clientes/${c.cliente.id}/whatsapp`
        : null
    if (!apiPath) return
    const nome = c.cliente?.nome ?? c.remoteJid?.replace('@s.whatsapp.net', '') ?? 'Contato'
    setDrawer({ apiPath, nome })
  }

  return (
    <>
      {/* Botão Nova mensagem */}
      <div className="flex justify-end">
        <button
          onClick={() => setNovaConversa(true)}
          className="flex items-center gap-2 rounded-[10px] bg-[#25D366] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#1fb855] active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            add_comment
          </span>
          Nova mensagem
        </button>
      </div>

      {/* Seção: Aguardando resposta */}
      {aguardandoResposta.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-error/10">
              <span className="material-symbols-outlined text-[16px] text-error animate-pulse"
                style={{ fontVariationSettings: "'FILL' 1" }}>mark_unread_chat_alt</span>
            </span>
            <h2 className="text-[14px] font-semibold text-on-surface">Aguardando sua resposta</h2>
            <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-bold text-error">
              {aguardandoResposta.length}
            </span>
            <span className="text-[11px] text-on-surface-variant/50">Cliente respondeu — IA pausada</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {aguardandoResposta.map(c => (
              <ConversaCard key={c.id} c={c} urgente onOpenDrawer={() => openDrawer(c)} />
            ))}
          </div>
        </section>
      )}

      {/* Seção: Em atendimento humano */}
      {emAtendimentoHumano.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-status/10">
              <span className="material-symbols-outlined text-[16px] text-orange-status"
                style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
            </span>
            <h2 className="text-[14px] font-semibold text-on-surface">Em atendimento (você)</h2>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
              {emAtendimentoHumano.length}
            </span>
            <span className="text-[11px] text-on-surface-variant/50">IA pausada — aguarda sua mensagem</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {emAtendimentoHumano.map(c => (
              <ConversaCard key={c.id} c={c} onOpenDrawer={() => openDrawer(c)} />
            ))}
          </div>
        </section>
      )}

      {/* Seção: Ativas pela IA */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <span className="material-symbols-outlined text-[16px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
          </span>
          <h2 className="text-[14px] font-semibold text-on-surface">Atendidas pela IA</h2>
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
            {ativasIA.length}
          </span>
          <span className="text-[11px] text-on-surface-variant/50">(últimas 24h)</span>
        </div>
        {ativasIA.length === 0 ? (
          <p className="rounded-[14px] border border-outline-variant/15 bg-card px-6 py-8 text-center text-[13px] text-on-surface-variant/50">
            Nenhuma conversa ativa pela IA no momento
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ativasIA.map(c => (
              <ConversaCard key={c.id} c={c} onOpenDrawer={() => openDrawer(c)} />
            ))}
          </div>
        )}
      </section>

      {/* WhatsApp drawer compartilhado */}
      {drawer && (
        <WhatsAppDrawer
          apiPath={drawer.apiPath}
          nomeExibido={drawer.nome}
          open={!!drawer}
          onClose={() => setDrawer(null)}
        />
      )}

      {/* Drawer: Nova mensagem */}
      <NovaConversaSheet
        open={novaConversa}
        onClose={() => setNovaConversa(false)}
        onSelect={(apiPath, nome) => {
          setNovaConversa(false)
          setDrawer({ apiPath, nome })
        }}
      />
    </>
  )
}

// ─── Card de conversa ────────────────────────────────────────────────────────

function ConversaCard({
  c,
  urgente,
  onOpenDrawer,
}: {
  c: ConversaGridItem
  urgente?: boolean
  onOpenDrawer: () => void
}) {
  const nomeExibido =
    c.cliente?.nome ??
    ((c.lead?.dadosJson as any)?.nomeCompleto as string | undefined) ??
    ((c.lead?.dadosJson as any)?.nome as string | undefined) ??
    c.lead?.contatoEntrada ??
    c.remoteJid?.replace('@s.whatsapp.net', '') ??
    'Desconhecido'

  const ultimaMensagem = c.mensagens[0]
  const canalIcon  = CANAL_ICON[c.canal]  ?? 'chat'
  const canalLabel = CANAL_LABEL[c.canal] ?? c.canal
  const canalColor = CANAL_COLOR[c.canal] ?? 'text-on-surface-variant'
  const podeWhatsApp = c.canal === 'whatsapp' && (!!c.cliente?.id || !!c.socioId)

  return (
    <div className={`group relative rounded-[14px] border bg-card shadow-sm transition-colors hover:bg-surface-container ${
      urgente ? 'border-error/30 ring-1 ring-error/15' : 'border-outline-variant/15'
    }`}>
      <Link href={`/crm/atendimentos/conversa/${c.id}`} className="block p-4">
        {/* Canal + hora + badge estado */}
        <div className="mb-2 flex items-center gap-2">
          <span className={`material-symbols-outlined text-[16px] ${canalColor}`}
            style={{ fontVariationSettings: "'FILL' 1" }}>{canalIcon}</span>
          <span className={`text-[11px] font-bold uppercase tracking-wider ${canalColor}`}>
            {canalLabel}
          </span>
          {c.pausadaEm ? (
            urgente ? (
              <span className="flex items-center gap-0.5 rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-semibold text-error">
                <span className="material-symbols-outlined text-[11px]">mark_unread_chat_alt</span>
                nova msg
              </span>
            ) : (
              <span className="flex items-center gap-0.5 rounded-full bg-orange-status/10 px-2 py-0.5 text-[10px] font-semibold text-orange-status">
                <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
                humano
              </span>
            )
          ) : (
            <span className="flex items-center gap-0.5 rounded-full bg-green-status/10 px-2 py-0.5 text-[10px] font-semibold text-green-status">
              <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              IA
            </span>
          )}
          <span className="ml-auto text-[10px] text-on-surface-variant/40">
            {formatDateTime(c.atualizadaEm)}
          </span>
        </div>

        {/* Nome */}
        <p className="truncate text-[13px] font-semibold text-on-surface">{nomeExibido}</p>

        {/* Última mensagem */}
        {ultimaMensagem && (
          <p className={`mt-1 line-clamp-2 text-[11px] leading-relaxed ${urgente ? 'text-on-surface font-medium' : 'text-on-surface-variant/70'}`}>
            <span className="font-medium">
              {ultimaMensagem.role === 'assistant' ? 'IA: ' : 'Cliente: '}
            </span>
            {ultimaMensagem.conteudo}
          </p>
        )}
      </Link>

      {/* Ações */}
      <div className="flex items-center gap-2 border-t border-outline-variant/10 px-4 py-2">
        {podeWhatsApp && (
          <button
            onClick={e => { e.preventDefault(); onOpenDrawer() }}
            className="flex items-center gap-1.5 rounded-lg bg-[#25D366]/10 px-3 py-1.5 text-[11px] font-semibold text-[#25D366] transition-colors hover:bg-[#25D366]/20"
          >
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              chat_bubble
            </span>
            Responder
          </button>
        )}
        <Link
          href={`/crm/atendimentos/conversa/${c.id}`}
          className="ml-auto flex items-center gap-1 text-[11px] text-on-surface-variant/50 hover:text-on-surface transition-colors"
        >
          Ver conversa
          <span className="material-symbols-outlined text-[13px]">chevron_right</span>
        </Link>
      </div>
    </div>
  )
}

// ─── Sheet: Nova conversa ─────────────────────────────────────────────────────

type Contato = {
  id: string
  nome: string
  whatsapp: string | null
  telefone: string | null
  tipo: 'cliente' | 'socio'
  subtitulo: string
}

function NovaConversaSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (apiPath: string, nome: string) => void
}) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<Contato[]>([])
  const [buscando, setBuscando] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buscar = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) { setResultados([]); return }
    timerRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/crm/contatos?q=${encodeURIComponent(q)}`)
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

  function handleSelect(c: Contato) {
    const phone = c.whatsapp || c.telefone
    if (!phone) return
    const apiPath = c.tipo === 'socio'
      ? `/api/socios/${c.id}/whatsapp`
      : `/api/clientes/${c.id}/whatsapp`
    onSelect(apiPath, c.nome)
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-sm flex-col gap-0 p-0" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15">
            <span className="material-symbols-outlined text-[18px] text-[#25D366]"
              style={{ fontVariationSettings: "'FILL' 1" }}>add_comment</span>
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-on-surface">Nova mensagem</p>
            <p className="text-[11px] text-on-surface-variant">Busque um cliente ou sócio</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Busca */}
        <div className="px-4 pt-4 pb-2">
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
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/20">
                contacts
              </span>
              <p className="text-[13px] text-on-surface-variant/50">
                Digite pelo menos 2 caracteres para buscar
              </p>
            </div>
          ) : resultados.length === 0 && !buscando ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/20">
                person_search
              </span>
              <p className="text-[13px] text-on-surface-variant/50">
                Nenhum contato encontrado com WhatsApp cadastrado
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 pt-2">
              {resultados.map(c => {
                const phone = c.whatsapp || c.telefone
                return (
                  <button
                    key={`${c.tipo}-${c.id}`}
                    onClick={() => handleSelect(c)}
                    className="flex w-full items-center gap-3 rounded-xl border border-outline-variant/10 bg-card p-3.5 text-left transition-colors hover:bg-surface-container"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/10">
                      <span className="material-symbols-outlined text-[18px] text-[#25D366]"
                        style={{ fontVariationSettings: "'FILL' 1" }}>
                        {c.tipo === 'socio' ? 'badge' : 'business'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[13px] font-semibold text-on-surface">{c.nome}</p>
                      <p className="text-[11px] text-on-surface-variant/60">
                        {c.subtitulo} · {phone}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-[#25D366] shrink-0"
                      style={{ fontVariationSettings: "'FILL' 1" }}>chat_bubble</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
