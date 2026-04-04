import { prisma } from '@/lib/prisma'
import { startOfDayBrasilia, cn } from '@/lib/utils'
import Link from 'next/link'
import { AutoRefresh } from '@/components/ui/auto-refresh'

const PLANO_LABEL: Record<string, string> = {
  essencial: 'Essencial',
  profissional: 'Profissional',
  empresarial: 'Empresarial',
  startup: 'Startup',
}

const REGIME_LABEL: Record<string, string> = {
  MEI: 'MEI',
  SimplesNacional: 'Simples',
  LucroPresumido: 'L. Presumido',
  LucroReal: 'L. Real',
  Autonomo: 'Autônomo',
}

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

// Em vez de backgrounds pesados, usamos cores sutis de texto ou ícones
const CANAL_ESCALACAO_COLOR: Record<string, string> = {
  whatsapp: 'text-emerald-600',
  onboarding: 'text-primary',
  portal: 'text-orange-500',
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
    clientesInadimplentes,
    valorTotalAtraso,
    inadimplentesRecentes,
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
    prisma.cliente.findMany({
      where: { status: 'ativo' },
      orderBy: { atualizadoEm: 'desc' },
      take: 8,
      include: { empresa: { select: { nomeFantasia: true, razaoSocial: true, regime: true } } },
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
    escalacoesPendentes, clienteMap,
    clientesRecentes, osRecentes,
    taxaResolucaoIA, convHojeTotal, escalacaoHojeTotal,
    clientesInadimplentes,
    valorTotalAtraso: Number(valorTotalAtraso._sum.valor ?? 0),
    inadimplentesRecentes,
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

        {/* COLUNA ESQUERDA: Tabela Elegante */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-card">
          <div className="flex items-center justify-between border-b border-outline-variant/10 px-6 py-5">
            <div>
              <h2 className="font-headline text-[15px] font-semibold text-on-surface">Movimentações Recentes</h2>
              <p className="mt-1 text-[12px] text-on-surface-variant/60">Clientes ativos recentemente atualizados</p>
            </div>
            <Link
              href="/crm/clientes"
              className="group flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-primary transition-colors hover:text-primary/80"
            >
              Ver todos
              <span className="material-symbols-outlined text-[16px] transition-transform duration-200 group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </Link>
          </div>

          {d.clientesRecentes.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 bg-surface-container-lowest/30">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/20">
                sentiment_dissatisfied
              </span>
              <p className="text-[13px] font-medium text-on-surface-variant/50">Nenhum cliente ativo no momento</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline-variant/10 bg-surface-container-lowest/40">
                    <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50">Cliente</th>
                    <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 hidden md:table-cell">Empresa / Regime</th>
                    <th className="px-6 py-3.5 text-right text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50">Plano / Tipo</th>
                  </tr>
                </thead>
                {/* Linhas minimalistas com hover sutil que não briga por atençao */}
                <tbody className="divide-y divide-outline-variant/5 bg-transparent">
                  {d.clientesRecentes.map((c) => (
                    <tr key={c.id} className="group transition-colors duration-200 hover:bg-surface-container-lowest/80">
                      <td className="px-6 py-4 align-top">
                        <Link href={`/crm/clientes/${c.id}`} className="block">
                          <p className="text-[13px] font-semibold text-on-surface transition-colors group-hover:text-primary">
                            {c.nome}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-on-surface-variant/60">{c.email}</p>
                        </Link>
                      </td>
                      <td className="px-6 py-4 align-top hidden md:table-cell">
                        {c.empresa ? (
                          <>
                            <p className="max-w-[200px] truncate text-[13px] font-medium text-on-surface-variant">
                              {c.empresa.nomeFantasia ?? c.empresa.razaoSocial ?? '—'}
                            </p>
                            {c.empresa.regime && (
                              <p className="mt-0.5 text-[11px] tracking-wide text-on-surface-variant/50">
                                {REGIME_LABEL[c.empresa.regime] ?? c.empresa.regime}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-[13px] font-medium text-on-surface-variant/30">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="inline-block rounded-[4px] border border-outline-variant/20 bg-surface-container px-2 py-0.5 text-[10px] font-medium tracking-wide text-on-surface-variant">
                            {PLANO_LABEL[c.planoTipo] ?? c.planoTipo}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40">
                            {c.tipoContribuinte}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          {/* Para evitar scroll infinito na direita, juntamos em um bloco limpo */}
          <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card">
            <div className="border-b border-outline-variant/10 px-6 py-5">
              <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest text-on-surface">
                Fila de Operação
              </h2>
            </div>

            <div className="divide-y divide-outline-variant/10">
              {/* Box A: Escalações Pendentes */}
              <div className="flex flex-col pb-2">
                <div className="bg-surface-container-lowest/50 px-6 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                      Escalações Recentes
                    </span>
                    {d.escalacoesPendentes.length > 0 && (
                      <span className="rounded-[4px] border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                        {d.escalacoesPendentes.length}
                      </span>
                    )}
                  </div>
                </div>
                {d.escalacoesPendentes.length === 0 ? (
                  <p className="px-6 py-4 text-[12px] font-medium text-on-surface-variant/50">Nenhuma escalação aguardando atendimento.</p>
                ) : (
                  <ul className="divide-y divide-outline-variant/5">
                    {d.escalacoesPendentes.map(e => (
                      <li key={e.id}>
                        <Link
                          href={`/crm/atendimentos?esc=${e.id}`}
                          className="group flex flex-col gap-1.5 px-6 py-3.5 transition-colors hover:bg-surface-container-lowest"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[13px] font-semibold text-on-surface transition-colors group-hover:text-primary">
                              {e.clienteId ? (d.clienteMap[e.clienteId] ?? 'Cliente') : 'Onboarding'}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className={cn('text-[10px] font-bold uppercase tracking-wide', CANAL_ESCALACAO_COLOR[e.canal] ?? 'text-on-surface-variant/50')}>
                                {CANAL_ESCALACAO_LABEL[e.canal] ?? e.canal}
                              </span>
                            </div>
                          </div>
                          <span className="truncate text-[12px] font-medium text-on-surface-variant/60">{e.ultimaMensagem}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Box B: Chamados */}
              <div className="flex flex-col pb-2">
                <div className="bg-surface-container-lowest/50 px-6 py-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
                    Chamados Abertos
                  </span>
                </div>
                {d.osRecentes.length === 0 ? (
                  <p className="px-6 py-4 text-[12px] font-medium text-on-surface-variant/50">Nenhum chamado aberto na lista.</p>
                ) : (
                  <ul className="divide-y divide-outline-variant/5">
                    {d.osRecentes.map(o => (
                      <li key={o.id}>
                        <Link
                          href={`/crm/chamados/${o.id}`}
                          className="group flex flex-col gap-2 px-6 py-3.5 transition-colors hover:bg-surface-container-lowest"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-[13px] font-bold leading-snug text-on-surface transition-colors group-hover:text-primary">
                              {o.titulo}
                            </span>
                            <span className={cn(
                              'mt-0.5 shrink-0 rounded-[4px] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide',
                              // Trocando os backgrounds com /10 por algo mais seco
                              o.status === 'aberta' ? 'bg-primary/10 text-primary' :
                                o.status === 'em_andamento' ? 'bg-orange-500/10 text-orange-600' :
                                  o.status === 'resolvida' ? 'bg-emerald-500/10 text-emerald-600' :
                                    'bg-surface-container text-on-surface-variant/70'
                            )}>
                              {STATUS_CHAMADO_LABEL[o.status] ?? o.status}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium tracking-wide text-on-surface-variant/60">{o.cliente.nome}</span>
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
