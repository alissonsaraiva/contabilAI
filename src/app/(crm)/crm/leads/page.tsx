import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { formatBRL, formatDateTime } from '@/lib/utils'
import { CANAL_LABELS, PLANO_LABELS, CANAL_COLORS, PLANO_COLORS } from '@/types'
import type { StatusLead } from '@prisma/client'
import { NovoLeadDrawer } from '@/components/crm/novo-lead-drawer'

const COLUNAS: { status: StatusLead; label: string; dot: string }[] = [
  { status: 'iniciado', label: 'Iniciado', dot: 'bg-on-surface-variant/40' },
  { status: 'simulador', label: 'Simulador', dot: 'bg-primary' },
  { status: 'plano_escolhido', label: 'Plano', dot: 'bg-tertiary' },
  { status: 'dados_preenchidos', label: 'Dados', dot: 'bg-blue-500' },
  { status: 'aguardando_assinatura', label: 'Ag. Assinatura', dot: 'bg-orange-status' },
  { status: 'assinado', label: 'Assinado', dot: 'bg-green-status' },
]

export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({
    where: { status: { notIn: ['cancelado', 'expirado'] } },
    orderBy: { criadoEm: 'desc' },
    include: { responsavel: { select: { nome: true } } },
  })

  const grouped = COLUNAS.map((col) => ({
    ...col,
    leads: leads.filter((l) => l.status === col.status),
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface flex items-center gap-3">
            Leads
            <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-bold text-on-surface-variant border border-outline-variant/20">
              {leads.length} ativos
            </span>
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Gerencie o funil de conversão dos novos clientes
          </p>
        </div>
        <NovoLeadDrawer />
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto pb-4 custom-scrollbar">
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
                  {col.leads.length}
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
                  col.leads.map((lead) => (
                    <Link key={lead.id} href={`/crm/leads/${lead.id}`}>
                      <div className="group rounded-[14px] border border-outline-variant/15 bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-outline-variant/30 flex flex-col gap-3">
                        <h4 className="truncate text-[14px] font-semibold text-on-surface">
                          {(lead.dadosJson as Record<string, string> | null)?.['Nome completo'] ?? lead.contatoEntrada}
                        </h4>

                        <div className="flex flex-wrap gap-1.5">
                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CANAL_COLORS[lead.canal] ?? 'bg-slate-100 text-slate-600'}`}>
                            {CANAL_LABELS[lead.canal]}
                          </span>
                          {lead.planoTipo && (
                            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLANO_COLORS[lead.planoTipo] ?? 'bg-slate-100 text-slate-600'}`}>
                              {PLANO_LABELS[lead.planoTipo]}
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
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
