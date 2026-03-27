import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { formatDateTime, formatBRL } from '@/lib/utils'
import { CANAL_LABELS, STATUS_LEAD_LABELS, PLANO_LABELS, FORMA_PAGAMENTO_LABELS, STATUS_CONTRATO_LABELS } from '@/types'
import Link from 'next/link'
import { AvancarEtapaBtn } from '@/components/crm/avancar-etapa-btn'
import { EditarLeadDrawer } from '@/components/crm/editar-lead-drawer'
import { CopyFieldButton } from '@/components/crm/copy-field-button'
import { HistoricoList } from '@/components/crm/historico-list'
import { IniciarOnboardingBtn } from '@/components/crm/iniciar-onboarding-btn'
import { WhatsAppLeadDrawerButton } from '@/components/crm/whatsapp-lead-drawer-button'
import { ConversasIAList } from '@/components/crm/conversas-ia-list'
import { AssistenteContextSetter } from '@/components/crm/assistente-context'
import { EnviarZapSignBtn } from '@/components/crm/enviar-zapsign-btn'

type Props = { params: Promise<{ id: string }> }

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      responsavel: true,
      contrato: true,
      cliente: { select: { id: true, nome: true } },
      documentos: true,
      interacoes: { orderBy: { criadoEm: 'desc' } },
      conversas: {
        where: { canal: 'whatsapp' },
        orderBy: { atualizadaEm: 'desc' },
        include: { mensagens: { orderBy: { criadaEm: 'asc' } } },
      },
    },
  })

  if (!lead) notFound()

  const dadosJson = lead.dadosJson as Record<string, string> | null
  const nomeExibido = dadosJson?.['Nome completo'] ?? lead.contatoEntrada
  const ref = `LEAD-${lead.criadoEm.getFullYear()}-${id.slice(-4).toUpperCase()}`
  const isProspecto = (lead as Record<string, unknown>)['funil'] === 'prospeccao'

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          {/* Back + reference */}
          <div className="flex items-center gap-3">
            <Link
              href={isProspecto ? '/crm/prospeccao' : '/crm/leads'}
              className="flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              {isProspecto ? 'Prospecção' : 'Onboarding'}
            </Link>
            <span className="text-on-surface-variant/30">·</span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              <span className="material-symbols-outlined text-[13px]">folder_open</span>
              {ref}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-4xl font-light tracking-tight text-on-surface">
            {nomeExibido}
          </h1>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className="inline-flex items-center gap-1 rounded-md border border-green-status/20 bg-green-status/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-status">
              <span className="h-1.5 w-1.5 rounded-full bg-green-status" />
              Ativo
            </span>
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isProspecto ? 'bg-orange-status/10 text-orange-status' : 'bg-primary/10 text-primary'}`}>
              <span className="material-symbols-outlined text-[12px]">{isProspecto ? 'contact_phone' : 'rocket_launch'}</span>
              {isProspecto ? 'Prospecção' : 'Onboarding'}
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
        <div className="flex shrink-0 flex-wrap gap-3">
          <WhatsAppLeadDrawerButton leadId={lead.id} nomeExibido={nomeExibido} />
          <EditarLeadDrawer lead={lead} />
          {!isProspecto && lead.contrato?.status !== 'assinado' && (
            <EnviarZapSignBtn
              leadId={lead.id}
              contratoStatus={lead.contrato?.status}
              signUrl={lead.contrato?.zapsignSignUrl}
              compact
            />
          )}
          {isProspecto
            ? <IniciarOnboardingBtn leadId={lead.id} />
            : <AvancarEtapaBtn leadId={lead.id} />
          }
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
            <InfoRow label="Contato" value={lead.contatoEntrada} />
            <InfoRow label="Canal de Origem" value={CANAL_LABELS[lead.canal]} />

            {/* Step com progress bar */}
            <div className="sm:col-span-2 space-y-2 mt-2">
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
                  <CopyFieldButton value={String(v)} />
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

      {/* Contrato + Cliente convertido */}
      {(lead.contrato || lead.cliente) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Card contrato */}
          {lead.contrato && (
            <div className="rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-primary/80"
                  style={{ fontVariationSettings: "'FILL' 1" }}>contract</span>
                <h2 className="font-headline text-base font-semibold text-on-surface">Contrato</h2>
                <span className={`ml-auto rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${lead.contrato.status === 'assinado' ? 'bg-green-status/10 text-green-status' : 'bg-orange-status/10 text-orange-status'}`}>
                  {STATUS_CONTRATO_LABELS[lead.contrato.status] ?? lead.contrato.status}
                </span>
              </div>
              <div className="space-y-3">
                {lead.contrato.planoTipo && (
                  <InfoRow label="Plano" value={PLANO_LABELS[lead.contrato.planoTipo]} />
                )}
                <InfoRow label="Valor mensal" value={`R$ ${Number(lead.contrato.valorMensal).toFixed(2).replace('.', ',')}`} bold />
                {lead.contrato.assinadoEm && (
                  <InfoRow label="Assinado em" value={formatDateTime(lead.contrato.assinadoEm)} />
                )}
                {lead.contrato.pdfUrl && (
                  <a
                    href={`/api/leads/${id}/contrato/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-2 rounded-xl bg-primary/8 px-4 py-3 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>picture_as_pdf</span>
                    Baixar contrato assinado
                    <span className="material-symbols-outlined ml-auto text-[16px] opacity-60">download</span>
                  </a>
                )}
              </div>
              <EnviarZapSignBtn
                leadId={id}
                contratoStatus={lead.contrato.status}
                signUrl={lead.contrato.zapsignSignUrl}
              />
            </div>
          )}

          {/* Card cliente convertido */}
          {lead.cliente && (
            <div className="rounded-[14px] border border-green-status/20 bg-green-status/5 p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <span className="material-symbols-outlined text-[20px] text-green-status"
                  style={{ fontVariationSettings: "'FILL' 1" }}>person_check</span>
                <h2 className="font-headline text-base font-semibold text-on-surface">Cliente ativo</h2>
                <span className="ml-auto rounded-full bg-green-status/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-green-status">
                  Convertido
                </span>
              </div>
              <p className="mb-4 text-[14px] font-medium text-on-surface">{lead.cliente.nome}</p>
              <Link
                href={`/crm/clientes/${lead.cliente.id}`}
                className="flex items-center gap-2 rounded-xl bg-green-status/10 px-4 py-3 text-[13px] font-semibold text-green-status transition-colors hover:bg-green-status/20"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                Ver ficha do cliente
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Conversas IA (WhatsApp) */}
      {lead.conversas.length > 0 && (
        <div className="rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366]/15">
              <span
                className="material-symbols-outlined text-[17px] text-[#25D366]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                chat_bubble
              </span>
            </div>
            <h2 className="font-headline text-base font-semibold text-on-surface">Conversas IA</h2>
            <span className="ml-auto rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">
              {lead.conversas.length} {lead.conversas.length === 1 ? 'conversa' : 'conversas'} ·{' '}
              {lead.conversas.reduce((acc: number, c: { mensagens: unknown[] }) => acc + c.mensagens.length, 0)} msgs
            </span>
          </div>
          <ConversasIAList conversas={lead.conversas} />
        </div>
      )}

      {/* Histórico de atividades */}
      <div className="rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px] text-primary/80">history</span>
            <h2 className="font-headline text-base font-semibold text-on-surface">Histórico de Atividades</h2>
          </div>
        </div>

        {lead.interacoes.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-on-surface-variant/30">timeline</span>
            <p className="text-[13px] text-on-surface-variant">Nenhuma atividade registrada</p>
          </div>
        ) : (
          <HistoricoList interacoes={lead.interacoes} />
        )}
      </div>

      <AssistenteContextSetter
        leadId={lead.id}
        nomeCliente={nomeExibido ?? 'Lead'}
      />
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
