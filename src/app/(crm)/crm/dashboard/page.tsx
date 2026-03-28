import { prisma } from '@/lib/prisma'
import { formatDateTime, startOfDayBrasilia } from '@/lib/utils'
import { CANAL_LABELS, STATUS_LEAD_LABELS, PLANO_LABELS, CANAL_COLORS, STATUS_LEAD_COLORS, PLANO_COLORS } from '@/types'
import Link from 'next/link'

async function getDashboardData() {
  const [totalClientes, leadsHoje, aguardandoAssinatura, tarefasVencendo, leadsRecentes] =
    await Promise.all([
      prisma.cliente.count({ where: { status: 'ativo' } }),
      prisma.lead.count({
        where: { criadoEm: { gte: startOfDayBrasilia() } },
      }),
      prisma.contrato.count({ where: { status: 'aguardando_assinatura' } }),
      prisma.tarefa.count({
        where: {
          status: { in: ['pendente', 'em_andamento'] },
          prazo: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.lead.findMany({
        orderBy: { criadoEm: 'desc' },
        take: 8,
        include: { responsavel: { select: { nome: true } } },
      }),
    ])
  return { totalClientes, leadsHoje, aguardandoAssinatura, tarefasVencendo, leadsRecentes }
}


const kpiConfig = [
  {
    key: 'totalClientes' as const,
    title: 'Clientes ativos',
    icon: 'person',
    iconBg: 'bg-green-status/10',
    iconColor: 'text-green-status',
    badge: 'Ativos',
    badgeClass: 'bg-green-status/10 text-green-status',
    href: '/crm/clientes?status=ativo',
  },
  {
    key: 'leadsHoje' as const,
    title: 'Leads hoje',
    icon: 'ads_click',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    badge: 'Hoje',
    badgeClass: 'bg-primary/10 text-primary',
    href: '/crm/leads',
  },
  {
    key: 'aguardandoAssinatura' as const,
    title: 'Ag. assinatura',
    icon: 'draw',
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-600',
    badge: 'Pendente',
    badgeClass: 'bg-cyan-500/10 text-cyan-700',
    href: '/crm/leads',
  },
  {
    key: 'tarefasVencendo' as const,
    title: 'Tarefas vencendo',
    icon: 'event_busy',
    iconBg: 'bg-orange-status/10',
    iconColor: 'text-orange-status',
    badge: 'Alerta',
    badgeClass: 'bg-orange-status/10 text-orange-status',
    href: '/crm/tarefas',
  },
]

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {kpiConfig.map(({ key, title, icon, iconBg, iconColor, badge, badgeClass, href }) => (
          <Link
            key={key}
            href={href}
            className="rounded-[14px] border border-outline-variant/15 bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-outline-variant/30 flex flex-col justify-between"
          >
            <div className="mb-4 flex items-start justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${iconBg}`}>
                <span className={`material-symbols-outlined text-[20px] ${iconColor}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >{icon}</span>
              </div>
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}>
                {badge}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/80">
                {title}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-on-surface">{data[key]}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Leads recentes */}
      {/* Leads recentes */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant/10 px-6 py-5">
          <div>
            <h2 className="font-headline text-lg font-semibold text-on-surface">Leads recentes</h2>
            <p className="mt-0.5 text-[13px] text-on-surface-variant/80">Acompanhe as últimas oportunidades capturadas</p>
          </div>
          <Link
            href="/crm/leads"
            className="flex items-center gap-1 text-[13px] font-semibold text-primary transition-all hover:gap-2"
          >
            Ver todos
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>

        {data.leadsRecentes.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">Nenhum lead ainda</span>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-outline-variant/15">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    Lead / Contato
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    Origem
                  </th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    Plano
                  </th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                    Criação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {data.leadsRecentes.map((lead) => (
                  <tr
                    key={lead.id}
                    className="group transition-colors hover:bg-surface-container-low/50"
                  >
                    <td className="px-6 py-3.5">
                      <Link href={`/crm/leads/${lead.id}`} className="block group/link">
                        <span className="text-[14px] font-semibold text-on-surface group-hover/link:text-primary transition-colors">
                          {(lead.dadosJson as Record<string, string> | null)?.['Nome completo'] ?? lead.contatoEntrada}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CANAL_COLORS[lead.canal] ?? 'bg-slate-100 text-slate-600'}`}>
                        {CANAL_LABELS[lead.canal]}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_LEAD_COLORS[lead.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LEAD_LABELS[lead.status]}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {lead.planoTipo ? (
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLANO_COLORS[lead.planoTipo] ?? 'bg-slate-100 text-slate-600'}`}>
                          {PLANO_LABELS[lead.planoTipo]}
                        </span>
                      ) : (
                        <span className="text-[13px] text-on-surface-variant/50">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-right text-[13px] text-on-surface-variant/80">
                      {formatDateTime(lead.criadoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
