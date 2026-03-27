import type { ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { AssumiirBtn } from './_components/assumir-btn'
import { DevolverIaBtn } from './_components/devolver-ia-btn'

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

  const [pendentes, emAtendimento, recentes, conversasAtivas] = await Promise.all([
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
    prisma.conversaIA.findMany({
      where: {
        canal:        { not: 'crm' },
        atualizadaEm: { gte: limite24h },
      },
      orderBy: { atualizadaEm: 'desc' },
      take: 50,
      include: {
        cliente: { select: { id: true, nome: true } },
        lead:    { select: { id: true, contatoEntrada: true, dadosJson: true } },
        mensagens: { orderBy: { criadaEm: 'desc' }, take: 1, select: { conteudo: true, role: true } },
      },
    }),
  ])

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-on-surface">Atendimentos</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Conversas que precisam de atenção humana
          </p>
        </div>
        {pendentes.length > 0 && (
          <span className="flex items-center gap-2 rounded-full bg-error/10 px-4 py-2 text-[13px] font-bold text-error">
            <span className="h-2 w-2 animate-pulse rounded-full bg-error" />
            {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Conversas ativas pela IA (últimas 24h) ──────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <span className="material-symbols-outlined text-[16px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
          </span>
          <h2 className="text-[14px] font-semibold text-on-surface">Conversas ativas pela IA</h2>
          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
            {conversasAtivas.length}
          </span>
          <span className="text-[11px] text-on-surface-variant/50">(últimas 24h)</span>
        </div>

        {conversasAtivas.length === 0 ? (
          <p className="rounded-[14px] border border-outline-variant/15 bg-card px-6 py-8 text-center text-[13px] text-on-surface-variant/50">
            Nenhuma conversa ativa no momento
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {conversasAtivas.map(c => {
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

              const destino = `/crm/atendimentos/conversa/${c.id}`

              const CardWrapper = ({ children }: { children: ReactNode }) => (
                <Link
                  href={destino}
                  className="group block rounded-[14px] border border-outline-variant/15 bg-card p-4 shadow-sm transition-colors hover:bg-surface-container"
                >
                  {children}
                </Link>
              )

              return (
                <CardWrapper key={c.id}>
                  {/* Canal + hora + badge pausada */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[16px] ${canalColor}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}>
                      {canalIcon}
                    </span>
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${canalColor}`}>
                      {canalLabel}
                    </span>
                    <span className="ml-auto text-[10px] text-on-surface-variant/40">
                      {formatDateTime(c.atualizadaEm)}
                    </span>
                  </div>

                  {/* Nome */}
                  <p className="truncate text-[13px] font-semibold text-on-surface">{nomeExibido}</p>

                  {/* Última mensagem */}
                  {ultimaMensagem && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-on-surface-variant/70">
                      <span className="font-medium">
                        {ultimaMensagem.role === 'assistant' ? 'IA: ' : 'Cliente: '}
                      </span>
                      {ultimaMensagem.conteudo}
                    </p>
                  )}

                  {c.pausadaEm
                    ? <DevolverIaBtn conversaId={c.id} />
                    : <AssumiirBtn conversaId={c.id} />
                  }
                </CardWrapper>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Escalações ──────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-error/10">
            <span className="material-symbols-outlined text-[16px] text-error"
              style={{ fontVariationSettings: "'FILL' 1" }}>escalator_warning</span>
          </span>
          <h2 className="text-[14px] font-semibold text-on-surface">Escalações</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <EscalacaoColuna
            titulo="Aguardando"
            cor="bg-error/8 text-error"
            icone="pending"
            items={pendentes}
          />
          <EscalacaoColuna
            titulo="Em atendimento"
            cor="bg-orange-status/8 text-orange-status"
            icone="support_agent"
            items={emAtendimento}
          />
          <EscalacaoColuna
            titulo="Resolvidos (recentes)"
            cor="bg-green-status/8 text-green-status"
            icone="check_circle"
            items={recentes}
          />
        </div>
      </section>
    </div>
  )
}

type EscalacaoItem = {
  id: string
  canal: string
  ultimaMensagem: string
  motivoIA: string | null
  criadoEm: Date
  clienteId: string | null
  leadId: string | null
}

function EscalacaoColuna({
  titulo,
  cor,
  icone,
  items,
}: {
  titulo: string
  cor: string
  icone: string
  items: EscalacaoItem[]
}) {
  return (
    <div className="rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${cor.split(' ')[0]}`}>
          <span className={`material-symbols-outlined text-[16px] ${cor.split(' ')[1]}`}
            style={{ fontVariationSettings: "'FILL' 1" }}>
            {icone}
          </span>
        </span>
        <h2 className="text-[13px] font-semibold text-on-surface">{titulo}</h2>
        <span className="ml-auto rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-on-surface-variant/50">Nenhum</p>
        ) : (
          items.map(item => <EscalacaoCard key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}

function EscalacaoCard({ item }: { item: EscalacaoItem }) {
  const canal = item.canal as string
  const icon = CANAL_ICON[canal] ?? 'chat'
  const label = CANAL_LABEL[canal] ?? canal
  const iconColor = CANAL_COLOR[canal] ?? 'text-on-surface-variant/60'

  return (
    <Link
      href={`/crm/atendimentos/${item.id}`}
      className="block rounded-xl border border-outline-variant/10 bg-surface-container-low/60 p-3.5 transition-colors hover:bg-surface-container"
    >
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined mt-0.5 shrink-0 text-[18px] ${iconColor}`}
          style={{ fontVariationSettings: "'FILL' 1" }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/50">
              {label}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-on-surface-variant/40">
              {formatDateTime(item.criadoEm)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-on-surface">
            {item.ultimaMensagem}
          </p>
          {item.motivoIA && (
            <p className="mt-1 line-clamp-1 text-[11px] italic text-on-surface-variant/50">
              {item.motivoIA}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
