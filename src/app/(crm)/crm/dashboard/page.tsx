import { prisma } from '@/lib/prisma'
import { startOfDayBrasilia, cn } from '@/lib/utils'
import Link from 'next/link'
import { AutoRefresh } from '@/components/ui/auto-refresh'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_CHAMADO_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_cliente: 'Aguardando',
  resolvida: 'Resolvida',
  cancelada: 'Cancelada',
}

const CANAL_ESCALACAO_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  onboarding: 'Onboarding',
  portal: 'Portal',
}

const CANAL_ESCALACAO_COLOR: Record<string, string> = {
  whatsapp: 'text-emerald-600',
  onboarding: 'text-primary',
  portal: 'text-orange-500',
}

const CANAL_ESCALACAO_ICON: Record<string, string> = {
  whatsapp: 'chat',
  onboarding: 'person_add',
  portal: 'language',
}

const STATUS_CHAMADO_ICON: Record<string, string> = {
  aberta: 'radio_button_unchecked',
  em_andamento: 'pending',
  aguardando_cliente: 'hourglass_top',
  resolvida: 'check_circle',
  cancelada: 'cancel',
}

const STATUS_CHAMADO_DOT: Record<string, string> = {
  aberta: 'bg-primary',
  em_andamento: 'bg-orange-500',
  aguardando_cliente: 'bg-amber-500',
  resolvida: 'bg-emerald-500',
  cancelada: 'bg-on-surface-variant/40',
}

const CANAL_CONVERSA_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  onboarding: 'Onboarding',
  portal: 'Portal',
  crm: 'CRM',
}

const CANAL_CONVERSA_COLOR: Record<string, string> = {
  whatsapp: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600',
  onboarding: 'border-primary/20 bg-primary/10 text-primary',
  portal: 'border-orange-500/20 bg-orange-500/10 text-orange-500',
  crm: 'border-violet-500/20 bg-violet-500/10 text-violet-600',
}

const CANAL_CONVERSA_ICON: Record<string, string> = {
  whatsapp: 'chat',
  onboarding: 'person_add',
  portal: 'language',
  crm: 'support_agent',
}

async function getDashboardData() {
  const hoje = startOfDayBrasilia()
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const vintEQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    clientesAtivos,
    clientesNovos,
    conversasHoje,
    chamadosAbertos,
    escalacoesPendentes,
    osRecentes,
    convHojeTotal,
    escalacaoHojeTotal,
    escalacaoHojeResolvidas,
    leadsHoje,
    clientesInadimplentes,
    valorTotalAtraso,
    inadimplentesRecentes,
    conversasRecentes,
  ] = await Promise.all([
    prisma.cliente.count({ where: { status: 'ativo' } }),
    prisma.cliente.count({ where: { status: 'ativo', criadoEm: { gte: trintaDiasAtras } } }),
    prisma.conversaIA.count({ where: { criadaEm: { gte: hoje } } }),
    prisma.chamado.count({ where: { status: { in: ['aberta', 'em_andamento', 'aguardando_cliente'] } } }),
    prisma.escalacao.findMany({
      where: { status: 'pendente' },
      orderBy: { criadoEm: 'desc' },
      take: 5,
    }),
    prisma.chamado.findMany({
      orderBy: { criadoEm: 'desc' },
      take: 5,
      include: { cliente: { select: { id: true, nome: true } } },
    }),
    prisma.conversaIA.count({ where: { criadaEm: { gte: hoje } } }),
    prisma.escalacao.count({ where: { criadoEm: { gte: hoje } } }),
    prisma.escalacao.count({ where: { criadoEm: { gte: hoje }, status: 'resolvida' } }),
    prisma.lead.count({ where: { criadoEm: { gte: hoje } } }),
    prisma.cliente.count({ where: { status: 'inadimplente' } }),
    prisma.cobrancaAsaas.aggregate({
      where: { status: 'OVERDUE' },
      _sum: { valor: true },
    }),
    prisma.cliente.findMany({
      where: { status: 'inadimplente' },
      orderBy: { inativadoEm: 'desc' },
      take: 5,
      select: {
        id: true,
        nome: true,
        inativadoEm: true,
        empresa: { select: { nomeFantasia: true, razaoSocial: true } },
        cobrancasAsaas: {
          where: { status: 'OVERDUE' },
          orderBy: { vencimento: 'asc' },
          take: 1,
          select: { valor: true, vencimento: true },
        },
      },
    }),
    prisma.conversaIA.findMany({
      where: {
        OR: [
          { ultimaMensagemEm: { gte: vintEQuatroHorasAtras } },
          { ultimaMensagemEm: null, atualizadaEm: { gte: vintEQuatroHorasAtras } },
        ],
        AND: [{ OR: [{ clienteId: { not: null } }, { leadId: { not: null } }, { socioId: { not: null } }] }],
      },
      orderBy: { atualizadaEm: 'desc' },
      take: 8,
      select: {
        id: true,
        canal: true,
        pausadaEm: true,
        ultimaMensagemEm: true,
        atualizadaEm: true,
        cliente: { select: { id: true, nome: true } },
        lead: { select: { id: true, contatoEntrada: true } },
        socio: { select: { id: true, nome: true } },
        mensagens: {
          orderBy: { criadaEm: 'desc' },
          take: 1,
          where: { excluido: false },
          select: { conteudo: true, role: true },
        },
      },
    }),
  ])

  // Manual join: Escalacao → Cliente
  const clienteIds = escalacoesPendentes.map(e => e.clienteId).filter((id): id is string => Boolean(id))
  const clientesEscalacao = clienteIds.length > 0
    ? await prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, nome: true } })
    : []
  const clienteMap = Object.fromEntries(clientesEscalacao.map(c => [c.id, c.nome]))

  const taxaResolucaoIA = escalacaoHojeTotal > 0
    ? Math.round((escalacaoHojeResolvidas / escalacaoHojeTotal) * 100)
    : 100

  return {
    clientesAtivos, clientesNovos,
    conversasHoje, chamadosAbertos, leadsHoje,
    escalacoesPendentes, clienteMap, osRecentes,
    taxaResolucaoIA, convHojeTotal, escalacaoHojeTotal,
    clientesInadimplentes,
    valorTotalAtraso: Number(valorTotalAtraso._sum.valor ?? 0),
    inadimplentesRecentes,
    conversasRecentes,
  }
}

export default async function DashboardPage() {
  const d = await getDashboardData()

  return (
    <div className="space-y-8 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <AutoRefresh intervalMs={60_000} />

      {/* ── SEÇÃO DE KPIs (Topo) ── */}
      {/* Geometria refinada (rounded-xl), sem cores berrantes, hover com scale sutil e barra ativa */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Clientes Ativos',
            value: d.clientesAtivos,
            sub: `+${d.clientesNovos} nos últimos 30 dias`,
            icon: 'groups',
            href: '/crm/clientes',
          },
          {
            label: 'Conversas Hoje',
            value: d.conversasHoje,
            sub: `${d.escalacaoHojeTotal} escaladas para analistas`,
            icon: 'forum',
            href: '/crm/atendimentos',
          },
          {
            label: 'Chamados Abertos',
            value: d.chamadosAbertos,
            sub: 'Em andamento ou aguardando',
            icon: 'assignment',
            href: '/crm/chamados',
          },
          {
            label: 'Leads Hoje',
            value: d.leadsHoje,
            sub: 'Novos prospects registrados',
            icon: 'rocket_launch',
            href: '/crm/leads',
          },
        ].map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-container-lowest hover:shadow-sm"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                {k.label}
              </span>
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant/40 transition-colors duration-300 group-hover:text-primary">
                {k.icon}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-headline text-[36px] font-bold leading-none tracking-tight text-on-surface">
                {k.value}
              </span>
              <span className="text-[12px] font-medium text-on-surface-variant/60">
                {k.sub}
              </span>
            </div>

            {/* Fim do "Bento Trap" - Barra interativa de progresso "fake" em vez de sombra gigante */}
            <div className="absolute left-0 bottom-0 h-[3px] w-0 bg-primary opacity-0 transition-all duration-500 ease-out group-hover:w-full group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      {/* ── GRID PRINCIPAL (Corpo) ── */}
      {/* Em vez do safe split 1fr / 340px, um split mais elegante: 1.5fr / 1fr p/ dar respiro */}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">

        {/* COLUNA ESQUERDA: Conversas Recentes (Atendimentos) */}
        <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card">
          <div className="flex items-center justify-between border-b border-outline-variant/10 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary/10">
                <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>forum</span>
              </div>
              <div>
                <h2 className="font-headline text-[15px] font-semibold text-on-surface">Conversas Recentes</h2>
                <p className="mt-0.5 text-[12px] text-on-surface-variant/60">Atendimentos nas últimas 48h</p>
              </div>
            </div>
            <Link
              href="/crm/atendimentos"
              className="group flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-primary transition-colors hover:text-primary/80"
            >
              Ver todos
              <span className="material-symbols-outlined text-[16px] transition-transform duration-200 group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </Link>
          </div>

          {d.conversasRecentes.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-3 bg-surface-container-lowest/30">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/20">chat_bubble_outline</span>
              <p className="text-[13px] font-medium text-on-surface-variant/50">Nenhuma conversa recente</p>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/5">
              {d.conversasRecentes.map(c => {
                const nomeContato = c.cliente?.nome ?? c.socio?.nome ?? c.lead?.contatoEntrada ?? 'Desconhecido'
                const previewMsg = c.mensagens[0]?.conteudo
                  ? (c.mensagens[0].conteudo.length > 80
                    ? c.mensagens[0].conteudo.slice(0, 80) + '…'
                    : c.mensagens[0].conteudo)
                  : 'Sem mensagens'
                const isHumano = Boolean(c.pausadaEm)
                const href = `/crm/atendimentos?conversa=${c.id}`

                return (
                  <li key={c.id}>
                    <Link
                      href={href}
                      className="group flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-surface-container-lowest/80"
                    >
                      <div className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        c.canal === 'whatsapp' ? 'bg-emerald-500/10' :
                          c.canal === 'portal' ? 'bg-orange-500/10' :
                            c.canal === 'crm' ? 'bg-violet-500/10' : 'bg-primary/10'
                      )}>
                        <span className={cn(
                          'material-symbols-outlined text-[16px]',
                          c.canal === 'whatsapp' ? 'text-emerald-600' :
                            c.canal === 'portal' ? 'text-orange-500' :
                              c.canal === 'crm' ? 'text-violet-600' : 'text-primary'
                        )}>
                          {CANAL_CONVERSA_ICON[c.canal] ?? 'forum'}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-on-surface transition-colors group-hover:text-primary">
                            {nomeContato}
                          </span>
                          <span className="shrink-0 text-[10px] font-medium text-on-surface-variant/50">
                            {formatDistanceToNow(new Date(c.ultimaMensagemEm ?? c.atualizadaEm), { locale: ptBR, addSuffix: true })}
                          </span>
                        </div>

                        <p className="mt-0.5 truncate text-[12px] font-medium text-on-surface-variant/60">
                          {c.mensagens[0]?.role === 'assistant' && (
                            <span className="text-primary/60">IA: </span>
                          )}
                          {previewMsg}
                        </p>

                        <div className="mt-1.5 flex items-center gap-2">
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                            CANAL_CONVERSA_COLOR[c.canal] ?? 'border-outline-variant/20 bg-surface-container text-on-surface-variant/70'
                          )}>
                            {CANAL_CONVERSA_LABEL[c.canal] ?? c.canal}
                          </span>
                          {isHumano ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Humano
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              IA Ativa
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* COLUNA DIREITA: Blocos de Ação (Atenção / Filas / Insights) */}
        {/* Retiramos a repetição infinita de cards e criamos uma hierarquia real */}
        <div className="flex flex-col gap-6">

          {/* 1. Alerta Financeiro (Alta prioridade e alto contraste, mas elegante) */}
          <div className="relative overflow-hidden rounded-xl border border-error/20 bg-card shadow-sm">
            {/* Minimalist Top Edge */}
            <div className="absolute left-0 top-0 h-1 w-full bg-error/80" />
            <div className="flex items-center justify-between border-b border-outline-variant/5 pt-5 px-6 pb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest text-error">
                  Atenção Financeira
                </h2>
              </div>
              {d.clientesInadimplentes > 0 && (
                <span className="rounded-full bg-error px-2 py-0.5 text-[10px] font-extrabold text-white">
                  {d.clientesInadimplentes} Inad.
                </span>
              )}
            </div>

            {d.clientesInadimplentes === 0 ? (
              <div className="flex items-center gap-3 px-6 py-8">
                <span className="material-symbols-outlined text-[24px] text-green-500">check_circle</span>
                <p className="text-[13px] font-medium text-on-surface-variant/70">Tudo em dia. Nenhum cliente inadimplente.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="px-6 py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50">Volume em Atraso</p>
                  <p className="mt-1 font-headline text-[28px] font-bold leading-none tracking-tight text-error">
                    {d.valorTotalAtraso.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>

                <ul className="divide-y divide-outline-variant/5 border-t border-outline-variant/5">
                  {d.inadimplentesRecentes.map(c => {
                    const cobranca = c.cobrancasAsaas[0]
                    const nomeExib = c.empresa?.nomeFantasia ?? c.empresa?.razaoSocial ?? c.nome
                    const diasAtraso = cobranca
                      ? Math.max(0, Math.floor((Date.now() - new Date(cobranca.vencimento).getTime()) / 86_400_000))
                      : null

                    return (
                      <li key={c.id}>
                        <Link
                          href={`/crm/clientes/${c.id}`}
                          className="group flex items-center justify-between px-6 py-3.5 transition-colors hover:bg-error/5"
                        >
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-on-surface transition-colors group-hover:text-error">
                              {nomeExib}
                            </span>
                            {cobranca && (
                              <span className="mt-0.5 text-[12px] font-medium text-error flex items-center gap-1">
                                {Number(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            )}
                          </div>
                          {diasAtraso !== null && (
                            <span className={cn(
                              'text-[10px] font-bold uppercase tracking-wide',
                              diasAtraso >= 15 ? 'text-error' : 'text-orange-500'
                            )}>
                              {diasAtraso} dias
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                <div className="border-t border-outline-variant/5 bg-surface-container-lowest/30 px-6 py-4">
                  <Link href="/crm/financeiro/inadimplentes" className="text-[12px] font-bold uppercase tracking-wide text-primary transition-colors hover:text-primary/80 hover:underline">
                    Painel Financeiro →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* 2. Insight Block (IA) - Quebrando o padrão para algo mais editorial */}
          <div className="relative overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container p-6">
            {/* Decalque decorativo para diferenciar o bloco de Insights */}
            <div className="absolute right-0 top-0 -mr-6 -mt-6 opacity-[0.03]">
              <span className="material-symbols-outlined text-[120px]">smart_toy</span>
            </div>

            <div className="relative z-10 flex items-center gap-2 text-on-surface">
              <span className="material-symbols-outlined text-[18px]">insights</span>
              <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest">
                Termômetro de IA
              </h2>
            </div>

            <div className="relative z-10 mt-6 flex flex-wrap items-center justify-between gap-6">
              <div className="flex flex-col">
                <span className="text-[28px] font-semibold text-on-surface leading-none">{d.convHojeTotal}</span>
                <span className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Interações</span>
              </div>
              <div className="h-8 w-px bg-outline-variant/20" />
              <div className="flex flex-col">
                <span className="text-[28px] font-semibold text-on-surface leading-none">{d.escalacaoHojeTotal}</span>
                <span className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Escaladas</span>
              </div>
              <div className="h-8 w-px bg-outline-variant/20" />
              <div className="flex flex-col items-end">
                <span className={cn('text-[28px] font-bold leading-none tracking-tight', d.taxaResolucaoIA >= 80 ? 'text-primary' : 'text-orange-500')}>
                  {d.taxaResolucaoIA}%
                </span>
                <span className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Contensão</span>
              </div>
            </div>
          </div>

          {/* 3. Filas de Trabalho Combinadas (Escalações + Chamados) */}
          <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary/10">
                <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>inbox</span>
              </div>
              <div className="flex-1">
                <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest text-on-surface">
                  Fila de Operação
                </h2>
              </div>
              {(d.escalacoesPendentes.length + d.osRecentes.filter(o => o.status !== 'resolvida' && o.status !== 'cancelada').length) > 0 && (
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {d.escalacoesPendentes.length + d.osRecentes.filter(o => o.status !== 'resolvida' && o.status !== 'cancelada').length} pendentes
                </span>
              )}
            </div>

            <div className="divide-y divide-outline-variant/15">
              {/* Box A: Escalações Pendentes */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">support_agent</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                      Escalações Recentes
                    </span>
                  </div>
                  {d.escalacoesPendentes.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error/10 px-1.5 text-[10px] font-bold text-error">
                      {d.escalacoesPendentes.length}
                    </span>
                  )}
                </div>
                {d.escalacoesPendentes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 px-6 py-8">
                    <span className="material-symbols-outlined text-[28px] text-on-surface-variant/25">check_circle</span>
                    <p className="text-[12px] font-medium text-on-surface-variant/40">Nenhuma escalação aguardando</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-outline-variant/10">
                    {d.escalacoesPendentes.map(e => (
                      <li key={e.id}>
                        <Link
                          href={`/crm/atendimentos?esc=${e.id}`}
                          className="group flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-surface-container-low/50"
                        >
                          <div className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                            e.canal === 'whatsapp' ? 'bg-emerald-500/10' :
                              e.canal === 'portal' ? 'bg-orange-500/10' : 'bg-primary/10'
                          )}>
                            <span className={cn(
                              'material-symbols-outlined text-[16px]',
                              CANAL_ESCALACAO_COLOR[e.canal] ?? 'text-on-surface-variant/50'
                            )}>
                              {CANAL_ESCALACAO_ICON[e.canal] ?? 'forum'}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-semibold text-on-surface transition-colors group-hover:text-primary">
                                {e.clienteId ? (d.clienteMap[e.clienteId] ?? 'Cliente') : 'Onboarding'}
                              </span>
                              <span className="shrink-0 text-[10px] font-medium text-on-surface-variant/50">
                                {formatDistanceToNow(e.criadoEm, { locale: ptBR, addSuffix: true })}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="truncate text-[12px] font-medium text-on-surface-variant/60">{e.ultimaMensagem}</span>
                            </div>
                            <span className={cn(
                              'mt-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                              e.canal === 'whatsapp' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' :
                                e.canal === 'portal' ? 'border-orange-500/20 bg-orange-500/10 text-orange-500' :
                                  'border-primary/20 bg-primary/10 text-primary'
                            )}>
                              {CANAL_ESCALACAO_LABEL[e.canal] ?? e.canal}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Box B: Chamados */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">confirmation_number</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                      Chamados Recentes
                    </span>
                  </div>
                </div>
                {d.osRecentes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 px-6 py-8">
                    <span className="material-symbols-outlined text-[28px] text-on-surface-variant/25">inbox</span>
                    <p className="text-[12px] font-medium text-on-surface-variant/40">Nenhum chamado na lista</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-outline-variant/10">
                    {d.osRecentes.map(o => (
                      <li key={o.id}>
                        <Link
                          href={`/crm/chamados/${o.id}`}
                          className="group flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-surface-container-low/50"
                        >
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container">
                            <span className={cn(
                              'material-symbols-outlined text-[16px]',
                              o.status === 'aberta' ? 'text-primary' :
                                o.status === 'em_andamento' ? 'text-orange-500' :
                                  o.status === 'resolvida' ? 'text-emerald-500' :
                                    'text-on-surface-variant/50'
                            )} style={{ fontVariationSettings: o.status === 'resolvida' ? "'FILL' 1" : undefined }}>
                              {STATUS_CHAMADO_ICON[o.status] ?? 'help'}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-[13px] font-semibold leading-snug text-on-surface transition-colors group-hover:text-primary">
                                {o.titulo}
                              </span>
                              <span className={cn(
                                'mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                                o.status === 'aberta' ? 'border-primary/20 bg-primary/10 text-primary' :
                                  o.status === 'em_andamento' ? 'border-orange-500/20 bg-orange-500/10 text-orange-600' :
                                    o.status === 'resolvida' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600' :
                                      o.status === 'aguardando_cliente' ? 'border-amber-500/20 bg-amber-500/10 text-amber-600' :
                                        'border-outline-variant/20 bg-surface-container text-on-surface-variant/70'
                              )}>
                                <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_CHAMADO_DOT[o.status] ?? 'bg-on-surface-variant/40')} />
                                {STATUS_CHAMADO_LABEL[o.status] ?? o.status}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-on-surface-variant/60">{o.cliente.nome}</span>
                              <span className="shrink-0 text-[10px] font-medium text-on-surface-variant/40">
                                {formatDistanceToNow(o.criadoEm, { locale: ptBR, addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
