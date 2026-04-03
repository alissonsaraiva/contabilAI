import { prisma } from '@/lib/prisma'
import { startOfDayBrasilia, cn } from '@/lib/utils'
import Link from 'next/link'
import { AutoRefresh } from '@/components/ui/auto-refresh'

const PLANO_LABEL: Record<string, string> = {
  essencial:     'Essencial',
  profissional:  'Profissional',
  empresarial:   'Empresarial',
  startup:       'Startup',
}

const REGIME_LABEL: Record<string, string> = {
  MEI:             'MEI',
  SimplesNacional: 'Simples',
  LucroPresumido:  'L. Presumido',
  LucroReal:       'L. Real',
  Autonomo:        'Autônomo',
}

const STATUS_OS_LABEL: Record<string, string> = {
  aberta:             'Aberta',
  em_andamento:       'Em andamento',
  aguardando_cliente: 'Aguardando',
  resolvida:          'Resolvida',
  cancelada:          'Cancelada',
}

const STATUS_OS_COLOR: Record<string, string> = {
  aberta:             'bg-primary/10 text-primary',
  em_andamento:       'bg-orange-status/10 text-orange-status',
  aguardando_cliente: 'bg-yellow-500/10 text-yellow-700',
  resolvida:          'bg-green-status/10 text-green-status',
  cancelada:          'bg-outline/10 text-on-surface-variant',
}

const CANAL_ESCALACAO_LABEL: Record<string, string> = {
  whatsapp:   'WhatsApp',
  onboarding: 'Onboarding',
  portal:     'Portal',
}

const CANAL_ESCALACAO_COLOR: Record<string, string> = {
  whatsapp:   'bg-green-status/10 text-green-status',
  onboarding: 'bg-primary/10 text-primary',
  portal:     'bg-orange-status/10 text-orange-status',
}

async function getDashboardData() {
  const hoje = startOfDayBrasilia()
  const trintaDiasAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    clientesAtivos,
    clientesNovos,
    conversasHoje,
    chamadosAbertos,
    escalacoesPendentes,
    clientesRecentes,
    osRecentes,
    convHojeTotal,
    escalacaoHojeTotal,
    escalacaoHojeResolvidas,
    leadsHoje,
  ] = await Promise.all([
    prisma.cliente.count({ where: { status: 'ativo' } }),
    prisma.cliente.count({ where: { status: 'ativo', criadoEm: { gte: trintaDiasAtras } } }),
    prisma.conversaIA.count({ where: { criadaEm: { gte: hoje } } }),
    prisma.ordemServico.count({ where: { status: { in: ['aberta', 'em_andamento', 'aguardando_cliente'] } } }),
    prisma.escalacao.findMany({
      where:   { status: 'pendente' },
      orderBy: { criadoEm: 'desc' },
      take:    5,
    }),
    prisma.cliente.findMany({
      where:   { status: 'ativo' },
      orderBy: { atualizadoEm: 'desc' },
      take:    8,
      include: { empresa: { select: { nomeFantasia: true, razaoSocial: true, regime: true } } },
    }),
    prisma.ordemServico.findMany({
      orderBy: { criadoEm: 'desc' },
      take:    5,
      include: { cliente: { select: { id: true, nome: true } } },
    }),
    prisma.conversaIA.count({ where: { criadaEm: { gte: hoje } } }),
    prisma.escalacao.count({ where: { criadoEm: { gte: hoje } } }),
    prisma.escalacao.count({ where: { criadoEm: { gte: hoje }, status: 'resolvida' } }),
    prisma.lead.count({ where: { criadoEm: { gte: hoje } } }),
  ])

  // Manual join: Escalacao → Cliente (no formal @relation)
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
    escalacoesPendentes, clienteMap,
    clientesRecentes, osRecentes,
    taxaResolucaoIA, convHojeTotal, escalacaoHojeTotal,
  }
}

export default async function DashboardPage() {
  const d = await getDashboardData()

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Clientes ativos',
            value: d.clientesAtivos,
            sub:   `+${d.clientesNovos} nos últimos 30 dias`,
            icon:  '👥',
            color: 'bg-primary/8',
            href:  '/crm/clientes',
          },
          {
            label: 'Conversas hoje',
            value: d.conversasHoje,
            sub:   `${d.escalacaoHojeTotal} escaladas`,
            icon:  '💬',
            color: 'bg-green-status/8',
            href:  '/crm/atendimentos',
          },
          {
            label: 'Chamados abertos',
            value: d.chamadosAbertos,
            sub:   'OS em andamento',
            icon:  '📋',
            color: 'bg-orange-status/8',
            href:  '/crm/ordens-servico',
          },
          {
            label: 'Leads hoje',
            value: d.leadsHoje,
            sub:   'Novos onboardings',
            icon:  '🚀',
            color: 'bg-tertiary/8',
            href:  '/crm/leads',
          },
        ].map(k => (
          <Link
            key={k.label}
            href={k.href}
            className="group flex flex-col rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-outline-variant/30"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${k.color} text-[22px]`}>
                {k.icon}
              </div>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant/30 transition-all group-hover:text-primary group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/70">{k.label}</p>
              <p className="mt-1 text-[32px] font-bold tracking-tight text-on-surface leading-none">{k.value}</p>
              <p className="mt-1.5 text-[12px] text-on-surface-variant/60">{k.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Body — 2 colunas */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

        {/* ── COLUNA ESQUERDA — Clientes ── */}
        <div className="rounded-[14px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-outline-variant/10 px-6 py-4">
            <div>
              <h2 className="font-headline text-[15px] font-semibold text-on-surface">Clientes ativos</h2>
              <p className="mt-0.5 text-[12px] text-on-surface-variant/70">Últimas movimentações</p>
            </div>
            <Link
              href="/crm/clientes"
              className="flex items-center gap-1 text-[12px] font-semibold text-primary transition-all hover:gap-2"
            >
              Ver todos
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>

          {d.clientesRecentes.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2">
              <span className="text-3xl">👥</span>
              <p className="text-[12px] text-on-surface-variant/50">Nenhum cliente ativo ainda</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant/10 bg-surface-container-lowest/60">
                    <th className="px-6 py-3 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/70">Cliente</th>
                    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/70 hidden md:table-cell">Empresa / Regime</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/70">Tipo</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/70">Plano</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/8">
                  {d.clientesRecentes.map(c => (
                    <tr key={c.id} className="group transition-colors hover:bg-surface-container-lowest/40">
                      <td className="px-6 py-3.5">
                        <Link href={`/crm/clientes/${c.id}`} className="block">
                          <p className="text-[13px] font-semibold text-on-surface group-hover:text-primary transition-colors">
                            {c.nome}
                          </p>
                          <p className="text-[11px] text-on-surface-variant/60">{c.email}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        {c.empresa ? (
                          <>
                            <p className="text-[13px] text-on-surface truncate max-w-[160px]">
                              {c.empresa.nomeFantasia ?? c.empresa.razaoSocial ?? '—'}
                            </p>
                            {c.empresa.regime && (
                              <p className="text-[11px] text-on-surface-variant/60">
                                {REGIME_LABEL[c.empresa.regime] ?? c.empresa.regime}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-[13px] text-on-surface-variant/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          c.tipoContribuinte === 'pj'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-secondary-tone/10 text-secondary-tone',
                        )}>
                          {c.tipoContribuinte.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
                          {PLANO_LABEL[c.planoTipo] ?? c.planoTipo}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── COLUNA DIREITA ── */}
        <div className="flex flex-col gap-5">

          {/* Escalações pendentes */}
          <div className="rounded-[14px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-[18px]">🔔</span>
                <h2 className="font-headline text-[14px] font-semibold text-on-surface">Escalações pendentes</h2>
                {d.escalacoesPendentes.length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">
                    {d.escalacoesPendentes.length}
                  </span>
                )}
              </div>
              <Link href="/crm/atendimentos" className="text-[12px] font-semibold text-primary hover:underline">
                Ver →
              </Link>
            </div>

            {d.escalacoesPendentes.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-6 text-center">
                <span className="text-2xl">✅</span>
                <p className="text-[12px] text-on-surface-variant/50">Sem escalações pendentes</p>
              </div>
            ) : (
              <ul className="divide-y divide-outline-variant/8">
                {d.escalacoesPendentes.map(e => (
                  <li key={e.id}>
                    <Link
                      href={`/crm/atendimentos?esc=${e.id}`}
                      className="flex items-start gap-3 px-5 py-3 hover:bg-surface-container-lowest/40 transition-colors"
                    >
                      <div className="mt-0.5 flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-on-surface truncate">
                          {e.clienteId ? (d.clienteMap[e.clienteId] ?? 'Cliente') : 'Onboarding'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant/60 truncate">{e.ultimaMensagem}</p>
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        CANAL_ESCALACAO_COLOR[e.canal] ?? 'bg-surface-container text-on-surface-variant',
                      )}>
                        {CANAL_ESCALACAO_LABEL[e.canal] ?? e.canal}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Chamados recentes */}
          <div className="rounded-[14px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-[18px]">📋</span>
                <h2 className="font-headline text-[14px] font-semibold text-on-surface">Chamados recentes</h2>
              </div>
              <Link href="/crm/ordens-servico" className="text-[12px] font-semibold text-primary hover:underline">
                Ver →
              </Link>
            </div>

            {d.osRecentes.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-6 text-center">
                <span className="text-2xl">📭</span>
                <p className="text-[12px] text-on-surface-variant/50">Sem chamados recentes</p>
              </div>
            ) : (
              <ul className="divide-y divide-outline-variant/8">
                {d.osRecentes.map(o => (
                  <li key={o.id}>
                    <Link
                      href={`/crm/ordens-servico/${o.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-surface-container-lowest/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-on-surface truncate">{o.titulo}</p>
                        <p className="text-[11px] text-on-surface-variant/60">{o.cliente.nome}</p>
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        STATUS_OS_COLOR[o.status] ?? 'bg-surface-container text-on-surface-variant',
                      )}>
                        {STATUS_OS_LABEL[o.status] ?? o.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* IA Desempenho */}
          <div className="rounded-[14px] border border-outline-variant/15 bg-card shadow-sm p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-[18px]">🧠</span>
              <h2 className="font-headline text-[14px] font-semibold text-on-surface">IA — hoje</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className="text-[22px] font-bold text-on-surface">{d.convHojeTotal}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Conversas</p>
              </div>
              <div className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className="text-[22px] font-bold text-error">{d.escalacaoHojeTotal}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Escaladas</p>
              </div>
              <div className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className={cn('text-[22px] font-bold', d.taxaResolucaoIA >= 80 ? 'text-green-status' : 'text-orange-status')}>
                  {d.taxaResolucaoIA}%
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Resolução</p>
              </div>
            </div>
            <Link
              href="/crm/relatorios"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <span className="text-[14px]">📊</span>
              Ver relatório completo
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
