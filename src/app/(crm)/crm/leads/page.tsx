import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatBRL, formatDateTime } from '@/lib/utils'
import { CANAL_LABELS, PLANO_LABELS, CANAL_COLORS, PLANO_COLORS } from '@/types'
import type { StatusLead } from '@prisma/client'
import { NovoLeadDrawer } from '@/components/crm/novo-lead-drawer'
import { LeadsPeriodoFilter } from '@/components/crm/leads-periodo-filter'
import { Suspense } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const COLUNAS: { status: StatusLead; label: string; dot: string }[] = [
  { status: 'iniciado', label: 'Iniciado', dot: 'bg-on-surface-variant/40' },
  { status: 'simulador', label: 'Simulador', dot: 'bg-primary' },
  { status: 'plano_escolhido', label: 'Plano', dot: 'bg-tertiary' },
  { status: 'dados_preenchidos', label: 'Dados', dot: 'bg-blue-500' },
  { status: 'aguardando_assinatura', label: 'Ag. Assinatura', dot: 'bg-orange-status' },
]

const CAP_POR_COLUNA = 15

function periodoParaData(periodo: string): Date | null {
  const dias: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
  if (!dias[periodo]) return null
  const d = new Date()
  d.setDate(d.getDate() - dias[periodo])
  return d
}

type Props = { searchParams: Promise<{ periodo?: string }> }

export default async function LeadsPage({ searchParams }: Props) {
  const { periodo = '30d' } = await searchParams
  const desde = periodoParaData(periodo)

  const leads = await prisma.lead.findMany({
    where: {
      status: { notIn: ['cancelado', 'expirado', 'assinado'] },
      ...(desde && { criadoEm: { gte: desde } }),
    },
    orderBy: { criadoEm: 'desc' },
    include: { responsavel: { select: { nome: true } } },
  })

  // Total de assinados no período (para mostrar no header)
  const totalAssinados = await prisma.lead.count({
    where: {
      status: 'assinado',
      ...(desde && { criadoEm: { gte: desde } }),
    },
  })

  const grouped = COLUNAS.map((col) => {
    const todos = leads.filter((l) => l.status === col.status)
    return { ...col, leads: todos.slice(0, CAP_POR_COLUNA), total: todos.length }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface flex items-center gap-3">
            Pipeline
            <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-bold text-on-surface-variant border border-outline-variant/20">
              {leads.length} em aberto
            </span>
            {totalAssinados > 0 && (
              <span className="rounded-md bg-green-status/10 px-2 py-0.5 text-xs font-bold text-green-status border border-green-status/20">
                {totalAssinados} convertido{totalAssinados > 1 ? 's' : ''}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Leads ativos no funil de conversão
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Suspense>
            <LeadsPeriodoFilter />
          </Suspense>
          <NovoLeadDrawer />
        </div>
      </div>

      {/* ── Mobile View: Tabs (hidden on md) ── */}
      <div className="block md:hidden">
        <Tabs defaultValue="iniciado" className="w-full">
          <div className="mb-6 overflow-x-auto custom-scrollbar pb-2">
            <TabsList className="inline-flex h-12 w-max min-w-full items-center justify-start gap-1 rounded-full bg-surface-container/80 p-1 text-on-surface-variant ring-1 ring-inset ring-outline-variant/20">
              {grouped.map((col) => (
                <TabsTrigger
                  key={col.status}
                  value={col.status}
                  className="inline-flex h-full items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-outline-variant/10 hover:text-on-surface"
                >
                  <div className={`mr-2 h-1.5 w-1.5 rounded-full ${col.dot}`} />
                  {col.label}
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums ${col.total > 0
                      ? 'bg-primary/10 text-primary'
                      : 'bg-outline-variant/20 text-on-surface-variant/80'
                      }`}
                  >
                    {col.total}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {grouped.map((col) => (
            <TabsContent key={col.status} value={col.status} className="m-0 focus-visible:outline-none">
              <div className="flex flex-col gap-3">
                {col.leads.length === 0 ? (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low/30">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">
                      Vazio
                    </span>
                  </div>
                ) : (
                  <>
                    {col.leads.map((lead) => (
                      <LeadCardItem key={lead.id} lead={lead} />
                    ))}
                    {col.total > CAP_POR_COLUNA && (
                      <div className="flex items-center justify-center rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low/20 py-3">
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                          + {col.total - CAP_POR_COLUNA} mais nesta etapa
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* ── Desktop View: Kanban (hidden on mobile, flex on md) ── */}
      <div className="hidden md:block overflow-x-auto pb-4 custom-scrollbar">
        <div className="flex gap-5" style={{ minWidth: 'max-content' }}>
          {grouped.map((col) => (
            <div key={col.status} className="flex w-[280px] flex-col gap-3">
              {/* Column header */}
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${col.dot}`} />
                  <h3 className="text-[13px] font-semibold tracking-wide text-on-surface-variant uppercase">{col.label}</h3>
                </div>
                <span className="rounded-full bg-outline-variant/15 px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                  {col.total}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-3">
                {col.leads.length === 0 ? (
                  <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low/30">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">
                      Vazio
                    </span>
                  </div>
                ) : (
                  <>
                    {col.leads.map((lead) => (
                      <LeadCardItem key={lead.id} lead={lead} />
                    ))}

                    {col.total > CAP_POR_COLUNA && (
                      <div className="flex items-center justify-center rounded-xl border border-dashed border-outline-variant/30 bg-surface-container-low/20 py-3">
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                          + {col.total - CAP_POR_COLUNA} mais nesta etapa
                        </span>
                      </div>
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

function LeadCardItem({ lead }: { lead: any }) {
  return (
    <Link href={`/crm/leads/${lead.id}`}>
      <div className="group rounded-[14px] border border-outline-variant/15 bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-outline-variant/30 flex flex-col gap-3">
        <h4 className="truncate text-[14px] font-semibold text-on-surface">
          {(lead.dadosJson as Record<string, string> | null)?.['Nome completo'] ?? lead.contatoEntrada}
        </h4>

        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CANAL_COLORS[lead.canal as keyof typeof CANAL_COLORS] ?? 'bg-slate-100 text-slate-600'}`}>
            {CANAL_LABELS[lead.canal as keyof typeof CANAL_LABELS]}
          </span>
          {lead.planoTipo && (
            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLANO_COLORS[lead.planoTipo as keyof typeof PLANO_COLORS] ?? 'bg-slate-100 text-slate-600'}`}>
              {PLANO_LABELS[lead.planoTipo as keyof typeof PLANO_LABELS]}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant/10 pt-3 mt-1">
          {lead.valorNegociado ? (
            <span className="text-xs font-semibold text-primary">
              {formatBRL(Number(lead.valorNegociado))}/mês
            </span>
          ) : (
            <span className="text-xs text-on-surface-variant/50">—</span>
          )}
          <span className="text-[10px] font-medium text-on-surface-variant/70">
            {formatDateTime(lead.criadoEm)}
          </span>
        </div>
      </div>
    </Link>
  )
}

