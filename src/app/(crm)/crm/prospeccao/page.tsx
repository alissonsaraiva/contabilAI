import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { CANAL_LABELS, CANAL_COLORS } from '@/types'
import { NovoProspectoDrawer } from '@/components/crm/novo-prospecto-drawer'
import { LeadsPeriodoFilter } from '@/components/crm/leads-periodo-filter'
import { Suspense } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const COLUNAS = [
  { step: 1, label: 'Novo',             dot: 'bg-on-surface-variant/40' },
  { step: 2, label: 'Em contato',       dot: 'bg-primary' },
  { step: 3, label: 'Qualificado',      dot: 'bg-tertiary' },
  { step: 4, label: 'Proposta enviada', dot: 'bg-orange-status' },
]

const CAP_POR_COLUNA = 15

function periodoParaData(periodo: string): Date | null {
  const dias: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
  if (!dias[periodo]) return null
  const d = new Date()
  d.setDate(d.getDate() - dias[periodo])
  return d
}

type ColunaProsp = { step: number; label: string; dot: string; leads: any[]; total: number }

type Props = { searchParams: Promise<{ periodo?: string }> }

export default async function ProspeccaoPage({ searchParams }: Props) {
  const { periodo = '30d' } = await searchParams
  const desde = periodoParaData(periodo)

  const filtroData = desde ? { criadoEm: { gte: desde } } : {}
  const whereBase  = { funil: 'prospeccao' as const, status: { notIn: ['cancelado', 'expirado', 'assinado'] as ('cancelado' | 'expirado' | 'assinado')[] }, ...filtroData }

  const [grouped, totalConvertidos, totalOnboarding] = await Promise.all([
    Promise.all(
      COLUNAS.map(async (col) => {
        const [items, total] = await Promise.all([
          prisma.lead.findMany({
            where: { ...whereBase, stepAtual: col.step },
            orderBy: { criadoEm: 'desc' },
            take: CAP_POR_COLUNA,
            include: { responsavel: { select: { nome: true } } },
          }),
          prisma.lead.count({ where: { ...whereBase, stepAtual: col.step } }),
        ])
        return { ...col, leads: items, total }
      })
    ),
    prisma.lead.count({ where: { funil: 'prospeccao', status: 'assinado', ...filtroData } }),
    prisma.lead.count({
      where: {
        funil: 'onboarding',
        canal: { in: ['whatsapp', 'instagram', 'google', 'indicacao', 'outro'] },
        ...filtroData,
      },
    }),
  ])

  const totalAbertos = grouped.reduce((s: number, c: { total: number }) => s + c.total, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface flex items-center gap-3">
            Prospecção
            <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-bold text-on-surface-variant border border-outline-variant/20">
              {totalAbertos} em aberto
            </span>
            {totalOnboarding > 0 && (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary border border-primary/20">
                {totalOnboarding} no onboarding
              </span>
            )}
            {totalConvertidos > 0 && (
              <span className="rounded-md bg-green-status/10 px-2 py-0.5 text-xs font-bold text-green-status border border-green-status/20">
                {totalConvertidos} convertido{totalConvertidos > 1 ? 's' : ''}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Contatos comerciais — WhatsApp, tráfego pago e indicações
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Suspense>
            <LeadsPeriodoFilter />
          </Suspense>
          <NovoProspectoDrawer />
        </div>
      </div>

      {/* ── Mobile View: Tabs ── */}
      <div className="block md:hidden">
        <Tabs defaultValue="1" className="w-full">
          <div className="mb-6 overflow-x-auto custom-scrollbar pb-2">
            <TabsList className="inline-flex h-12 w-max min-w-full items-center justify-start gap-1 rounded-full bg-surface-container/80 p-1 text-on-surface-variant ring-1 ring-inset ring-outline-variant/20">
              {(grouped as ColunaProsp[]).map((col) => (
                <TabsTrigger
                  key={col.step}
                  value={String(col.step)}
                  className="inline-flex h-full items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-outline-variant/10 hover:text-on-surface"
                >
                  <div className={`mr-2 h-1.5 w-1.5 rounded-full ${col.dot}`} />
                  {col.label}
                  <span className={`ml-1.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums ${col.total > 0 ? 'bg-primary/10 text-primary' : 'bg-outline-variant/20 text-on-surface-variant/80'}`}>
                    {col.total}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {(grouped as ColunaProsp[]).map((col) => (
            <TabsContent key={col.step} value={String(col.step)} className="m-0 focus-visible:outline-none">
              <div className="flex flex-col gap-3">
                {col.leads.length === 0 ? (
                  <EmptyCol />
                ) : (
                  <>
                    {col.leads.map((lead) => (
                      <ProspectoCard key={lead.id} lead={lead} />
                    ))}
                    {col.total > CAP_POR_COLUNA && (
                      <MaisIndicador extra={col.total - CAP_POR_COLUNA} />
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* ── Desktop View: Kanban ── */}
      <div className="hidden md:block overflow-x-auto pb-4 custom-scrollbar">
        <div className="flex gap-5" style={{ minWidth: 'max-content' }}>
          {(grouped as ColunaProsp[]).map((col) => (
            <div key={col.step} className="flex w-[280px] flex-col gap-3">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
                  <h3 className="text-[13px] font-semibold tracking-wide text-on-surface-variant uppercase">{col.label}</h3>
                </div>
                <span className="rounded-full bg-outline-variant/15 px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                  {col.total}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {col.leads.length === 0 ? (
                  <EmptyCol />
                ) : (
                  <>
                    {col.leads.map((lead) => (
                      <ProspectoCard key={lead.id} lead={lead} />
                    ))}
                    {col.total > CAP_POR_COLUNA && (
                      <MaisIndicador extra={col.total - CAP_POR_COLUNA} />
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyCol() {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low/30">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">
        Vazio
      </span>
    </div>
  )
}

function MaisIndicador({ extra }: { extra: number }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low/20 py-3">
      <span className="text-[11px] font-semibold text-on-surface-variant">
        + {extra} mais nesta etapa
      </span>
    </div>
  )
}

function ProspectoCard({ lead }: { lead: any }) {
  const nome = (lead.dadosJson as Record<string, string> | null)?.['Nome completo'] ?? lead.contatoEntrada
  const stepLabel: Record<number, string> = { 1: 'Novo', 2: 'Em contato', 3: 'Qualificado', 4: 'Proposta enviada' }

  return (
    <Link href={`/crm/leads/${lead.id}`}>
      <div className="group rounded-[14px] border border-outline-variant/15 bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-outline-variant/30 flex flex-col gap-3">
        <h4 className="truncate text-[14px] font-semibold text-on-surface">{nome}</h4>

        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CANAL_COLORS[lead.canal as keyof typeof CANAL_COLORS] ?? 'bg-slate-100 text-slate-600'}`}>
            {CANAL_LABELS[lead.canal as keyof typeof CANAL_LABELS]}
          </span>
          {lead.planoTipo && (
            <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
              Interesse: {lead.planoTipo}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant/10 pt-3 mt-1">
          <span className="text-[10px] font-semibold text-on-surface-variant/60">
            {stepLabel[lead.stepAtual] ?? 'Novo'}
          </span>
          <span className="text-[10px] font-medium text-on-surface-variant/70">
            {formatDateTime(lead.criadoEm)}
          </span>
        </div>
      </div>
    </Link>
  )
}
