import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { formatDateTime, formatBRL } from '@/lib/utils'
import { CANAL_LABELS, STATUS_LEAD_LABELS, PLANO_LABELS, FORMA_PAGAMENTO_LABELS } from '@/types'
import Link from 'next/link'
import { AvancarEtapaBtn } from '@/components/crm/avancar-etapa-btn'
import { EditarLeadDrawer } from '@/components/crm/editar-lead-drawer'

type Props = { params: Promise<{ id: string }> }

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      responsavel: true,
      contrato: true,
      documentos: true,
      interacoes: { orderBy: { criadoEm: 'desc' }, take: 20 },
    },
  })

  if (!lead) notFound()

  const dadosJson = lead.dadosJson as Record<string, string> | null
  const ref = `LEAD-${lead.criadoEm.getFullYear()}-${id.slice(-4).toUpperCase()}`

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          {/* Back + reference */}
          <div className="flex items-center gap-3">
            <Link
              href="/crm/leads"
              className="flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Pipeline
            </Link>
            <span className="text-on-surface-variant/30">·</span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              <span className="material-symbols-outlined text-[13px]">folder_open</span>
              {ref}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-4xl font-light tracking-tight text-on-surface">
            {lead.contatoEntrada}
          </h1>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className="inline-flex items-center gap-1 rounded-md border border-green-status/20 bg-green-status/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-status">
              <span className="h-1.5 w-1.5 rounded-full bg-green-status" />
              Ativo
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-container px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              <span className="material-symbols-outlined text-[12px]">ads_click</span>
              {CANAL_LABELS[lead.canal]}
            </span>
            <span className="inline-flex items-center rounded-md bg-surface-container px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              {STATUS_LEAD_LABELS[lead.status]}
            </span>
            {lead.planoTipo && (
              <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                {PLANO_LABELS[lead.planoTipo]}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-3">
          <EditarLeadDrawer lead={lead} />
          <AvancarEtapaBtn leadId={lead.id} />
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Info comercial */}
        <div className="rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm flex flex-col">
          <div className="mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-primary/80"
              style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
            <h2 className="font-headline text-base font-semibold text-on-surface">Informações Comerciais</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6">
            <InfoRow label="Contato" value={lead.contatoEntrada} />
            <InfoRow label="Canal de Origem" value={CANAL_LABELS[lead.canal]} />

            {/* Step com progress bar */}
            <div className="col-span-2 space-y-2 mt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Step atual</p>
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-primary">{lead.stepAtual} / 8</span>
                <div className="flex-1 overflow-hidden rounded-full bg-surface-container h-1.5 border border-outline-variant/10">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(lead.stepAtual / 8) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <InfoRow label="Plano de Interesse" value={lead.planoTipo ? PLANO_LABELS[lead.planoTipo] : '—'} />
            {lead.valorNegociado && (
              <InfoRow label="Valor Estimado" value={`${formatBRL(Number(lead.valorNegociado))}/mês`} bold />
            )}
            {lead.formaPagamento && (
              <InfoRow label="Forma de Pagamento" value={FORMA_PAGAMENTO_LABELS[lead.formaPagamento]} />
            )}
            {lead.vencimentoDia && (
              <InfoRow label="Vencimento Sugerido" value={`Todo dia ${lead.vencimentoDia}`} />
            )}
            <InfoRow label="Criado em" value={formatDateTime(lead.criadoEm)} />
          </div>
        </div>

        {/* Dados preenchidos */}
        <div className="rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm flex flex-col">
          <div className="mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-primary/80"
              style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
            <h2 className="font-headline text-base font-semibold text-on-surface">Dados Preenchidos</h2>
          </div>
          {dadosJson && Object.keys(dadosJson).length > 0 ? (
            <div className="space-y-2.5">
              {Object.entries(dadosJson).map(([k, v]) => (
                <div
                  key={k}
                  className="group flex items-center justify-between rounded-xl bg-surface-container px-4 py-3"
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{k}</p>
                    <p className="text-sm font-medium text-on-surface">{String(v)}</p>
                  </div>
                  <button className="opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant hover:text-primary">
                      content_copy
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant/30">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/30">
                edit_note
              </span>
              <p className="text-[13px] text-on-surface-variant">
                Aguardando preenchimento pelo lead
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Histórico de atividades */}
      <div className="rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-primary/80">history</span>
            <h2 className="font-headline text-base font-semibold text-on-surface">Histórico de Atividades</h2>
          </div>
          {lead.interacoes.length > 0 && (
            <button className="text-sm font-semibold text-primary hover:opacity-80">Ver tudo</button>
          )}
        </div>

        {lead.interacoes.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-on-surface-variant/30">timeline</span>
            <p className="text-[13px] text-on-surface-variant">Nenhuma atividade registrada</p>
          </div>
        ) : (
          <div className="space-y-0 mt-4">
            {lead.interacoes.map((interacao, idx) => (
              <div key={interacao.id} className="flex gap-4">
                {/* Timeline indicator */}
                <div className="flex flex-col items-center">
                  <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${idx === 0 ? 'bg-primary ring-4 ring-primary/10' : 'bg-outline-variant/40'}`} />
                  {idx < lead.interacoes.length - 1 && (
                    <div className="w-px flex-1 bg-outline-variant/20 my-1" />
                  )}
                </div>
                {/* Content */}
                <div className="pb-6 min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-[14px] font-semibold text-on-surface">{interacao.titulo ?? interacao.tipo}</p>
                    <span className="shrink-0 text-[11px] font-medium text-on-surface-variant/70">
                      {formatDateTime(interacao.criadoEm)}
                    </span>
                  </div>
                  {interacao.conteudo && (
                    <p className="mt-1 text-sm leading-relaxed text-on-surface-variant line-clamp-2">
                      {interacao.conteudo}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80">{label}</p>
      <p className={`text-[14px] ${bold ? 'font-semibold text-primary' : 'font-medium text-on-surface'}`}>{value}</p>
    </div>
  )
}
