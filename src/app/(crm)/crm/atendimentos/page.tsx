import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { AssumiirBtn } from './_components/assumir-btn'
import { DevolverIaBtn } from './_components/devolver-ia-btn'
import { AtendimentosGrid } from '@/components/crm/atendimentos-grid'

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

export default async function AtendimentosPage() {
  const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [todasConversas, pendentes, emAtendimento, recentes, emailsPendentes] = await Promise.all([
    prisma.conversaIA.findMany({
      where: {
        canal:        { not: 'crm' },
        atualizadaEm: { gte: limite24h },
      },
      orderBy: { atualizadaEm: 'desc' },
      take: 100,
      include: {
        cliente:   { select: { id: true, nome: true } },
        lead:      { select: { id: true, contatoEntrada: true, dadosJson: true } },
        mensagens: { orderBy: { criadaEm: 'desc' }, take: 1, select: { conteudo: true, role: true } },
      },
    }),
    prisma.escalacao.findMany({
      where: { status: 'pendente' },
      orderBy: { criadoEm: 'asc' },
      take: 50,
    }),
    prisma.escalacao.findMany({
      where: { status: 'em_atendimento' },
      orderBy: { atualizadoEm: 'desc' },
      take: 50,
    }),
    prisma.escalacao.findMany({
      where: { status: 'resolvida' },
      orderBy: { atualizadoEm: 'desc' },
      take: 10,
    }),
    prisma.interacao.count({ where: { tipo: 'email_recebido', respondidoEm: null } }).catch(() => 0),
  ])

  // Separa em 3 grupos com base no estado real
  const aguardandoResposta = todasConversas.filter(c =>
    c.pausadaEm && c.ultimaMensagemEm && c.ultimaMensagemEm > c.pausadaEm
  )
  const emAtendimentoHumano = todasConversas.filter(c =>
    c.pausadaEm && (!c.ultimaMensagemEm || c.ultimaMensagemEm <= c.pausadaEm)
  )
  const ativasIA = todasConversas.filter(c => !c.pausadaEm)

  const totalUrgente   = aguardandoResposta.length
  const totalEscalados = pendentes.length

  // Serializa datas para o client component
  const toGrid = (lista: typeof todasConversas) =>
    lista.map(c => ({
      id:               c.id,
      canal:            c.canal,
      pausadaEm:        c.pausadaEm?.toISOString() ?? null,
      ultimaMensagemEm: c.ultimaMensagemEm?.toISOString() ?? null,
      atualizadaEm:     c.atualizadaEm.toISOString(),
      remoteJid:        c.remoteJid,
      socioId:          c.socioId ?? null,
      cliente:          c.cliente,
      lead:             c.lead,
      mensagens:        c.mensagens,
    }))

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-on-surface">Atendimentos</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Central de comunicação e conversas ativas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalUrgente > 0 && (
            <span className="flex items-center gap-2 rounded-full bg-error/10 px-4 py-2 text-[13px] font-bold text-error">
              <span className="h-2 w-2 animate-pulse rounded-full bg-error" />
              {totalUrgente} aguardando resposta
            </span>
          )}
          {totalEscalados > 0 && (
            <span className="flex items-center gap-2 rounded-full bg-orange-status/10 px-4 py-2 text-[13px] font-bold text-orange-status">
              {totalEscalados} escalação{totalEscalados > 1 ? 'ões' : ''} pendente{totalEscalados > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Card de emails pendentes */}
      {emailsPendentes > 0 && (
        <Link
          href="/crm/emails"
          className="flex items-center gap-4 rounded-[14px] border border-primary/20 bg-primary/5 px-5 py-4 transition-colors hover:bg-primary/10"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <span className="material-symbols-outlined text-[20px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-on-surface">
              {emailsPendentes} e-mail{emailsPendentes > 1 ? 's' : ''} aguardando resposta
            </p>
            <p className="text-[12px] text-on-surface-variant/60">
              A IA já preparou sugestões de resposta para cada um
            </p>
          </div>
          <span className="material-symbols-outlined text-[20px] text-primary/60">arrow_forward</span>
        </Link>
      )}

      {/* Grid de conversas (client component — drawers inline) */}
      <AtendimentosGrid
        aguardandoResposta={toGrid(aguardandoResposta)}
        emAtendimentoHumano={toGrid(emAtendimentoHumano)}
        ativasIA={toGrid(ativasIA)}
      />

      {/* Escalações */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-error/10">
            <span className="material-symbols-outlined text-[16px] text-error"
              style={{ fontVariationSettings: "'FILL' 1" }}>escalator_warning</span>
          </span>
          <h2 className="text-[14px] font-semibold text-on-surface">Escalações</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <EscalacaoColuna titulo="Aguardando"          cor="bg-error/8 text-error"                 icone="pending"       items={pendentes}      />
          <EscalacaoColuna titulo="Em atendimento"      cor="bg-orange-status/8 text-orange-status" icone="support_agent" items={emAtendimento}  />
          <EscalacaoColuna titulo="Resolvidos (recentes)" cor="bg-green-status/8 text-green-status" icone="check_circle"  items={recentes}       />
        </div>
      </section>
    </div>
  )
}

// ─── Escalações ───────────────────────────────────────────────────────────────

type EscalacaoItem = {
  id: string; canal: string; ultimaMensagem: string; motivoIA: string | null; criadoEm: Date
}

function EscalacaoColuna({ titulo, cor, icone, items }: { titulo: string; cor: string; icone: string; items: EscalacaoItem[] }) {
  return (
    <div className="rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${cor.split(' ')[0]}`}>
          <span className={`material-symbols-outlined text-[16px] ${cor.split(' ')[1]}`}
            style={{ fontVariationSettings: "'FILL' 1" }}>{icone}</span>
        </span>
        <h2 className="text-[13px] font-semibold text-on-surface">{titulo}</h2>
        <span className="ml-auto rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.length === 0
          ? <p className="py-6 text-center text-[12px] text-on-surface-variant/50">Nenhum</p>
          : items.map(item => <EscalacaoCard key={item.id} item={item} />)
        }
      </div>
    </div>
  )
}

function EscalacaoCard({ item }: { item: EscalacaoItem }) {
  const icon      = CANAL_ICON[item.canal]  ?? 'chat'
  const label     = CANAL_LABEL[item.canal] ?? item.canal
  const iconColor = CANAL_COLOR[item.canal] ?? 'text-on-surface-variant/60'
  return (
    <Link
      href={`/crm/atendimentos/${item.id}`}
      className="block rounded-xl border border-outline-variant/10 bg-surface-container-low/60 p-3.5 transition-colors hover:bg-surface-container"
    >
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined mt-0.5 shrink-0 text-[18px] ${iconColor}`}
          style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/50">{label}</span>
            <span className="ml-auto shrink-0 text-[10px] text-on-surface-variant/40">{formatDateTime(item.criadoEm)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-on-surface">{item.ultimaMensagem}</p>
          {item.motivoIA && (
            <p className="mt-1 line-clamp-1 text-[11px] italic text-on-surface-variant/50">{item.motivoIA}</p>
          )}
        </div>
      </div>
    </Link>
  )
}
