import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'

const CANAL_ICON: Record<string, string> = {
  whatsapp: 'whatsapp',
  onboarding: 'chat',
}

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  onboarding: 'Site',
}

export default async function AtendimentosPage() {
  const [pendentes, emAtendimento, recentes] = await Promise.all([
    prisma.escalacao.findMany({
      where: { status: 'pendente' },
      orderBy: { criadoEm: 'asc' },
    }),
    prisma.escalacao.findMany({
      where: { status: 'em_atendimento' },
      orderBy: { atualizadoEm: 'desc' },
    }),
    prisma.escalacao.findMany({
      where: { status: 'resolvida' },
      orderBy: { atualizadoEm: 'desc' },
      take: 10,
    }),
  ])

  return (
    <div className="space-y-8">
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

      {/* Colunas */}
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

  return (
    <Link
      href={`/crm/atendimentos/${item.id}`}
      className="block rounded-xl border border-outline-variant/10 bg-surface-container-low/60 p-3.5 transition-colors hover:bg-surface-container"
    >
      <div className="flex items-start gap-2.5">
        <span className="material-symbols-outlined mt-0.5 text-[16px] text-on-surface-variant/60"
          style={{ fontVariationSettings: "'FILL' 1" }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/50">
              {label}
            </span>
            <span className="ml-auto text-[10px] text-on-surface-variant/40">
              {formatDateTime(item.criadoEm)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] text-on-surface">
            {item.ultimaMensagem}
          </p>
          {item.motivoIA && (
            <p className="mt-1 line-clamp-1 text-[11px] italic text-on-surface-variant/60">
              {item.motivoIA}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
