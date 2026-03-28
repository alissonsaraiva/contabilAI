import type { ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getAiConfig } from '@/lib/ai/config'
import { formatBRL, formatCPF, formatCNPJ, formatDate, formatTelefone } from '@/lib/utils'
import {
  STATUS_CLIENTE_LABELS,
  STATUS_CLIENTE_COLORS,
  PLANO_LABELS,
  PLANO_COLORS,
  FORMA_PAGAMENTO_LABELS,
  type StatusCliente,
} from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { NovaInteracaoDrawer } from '@/components/crm/nova-interacao-drawer'
import { EnviarEmailDrawer } from '@/components/crm/enviar-email-drawer'
import { ConversasIAList } from '@/components/crm/conversas-ia-list'
import { AssistenteContextSetter } from '@/components/crm/assistente-context'
import { WhatsAppDrawerButton } from '@/components/crm/whatsapp-drawer-button'
import { PortalLinkButton } from '@/components/crm/portal-link-button'
import { PortalChatButton } from '@/components/crm/portal-chat-button'
import { HistoricoTimeline } from '@/components/crm/historico-timeline'
import { ClienteStatusSelect } from '@/components/crm/cliente-status-select'
import { ReprocessarPdfButton } from '@/components/crm/reprocessar-pdf-button'
import { EditarClienteButton } from '@/components/crm/editar-cliente-button'
import { SocioPortalControls } from '@/components/crm/socio-portal-controls'

type Props = { params: Promise<{ id: string }> }

const REGIME_LABELS: Record<string, string> = {
  MEI: 'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido: 'Lucro Presumido',
  LucroReal: 'Lucro Real',
  Autonomo: 'Autônomo',
}

const STATUS_CONTRATO_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aguardando_assinatura: 'Ag. Assinatura',
  parcialmente_assinado: 'Parcial',
  assinado: 'Assinado',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
}

const STATUS_CONTRATO_COLORS: Record<string, string> = {
  rascunho: 'bg-surface-container text-on-surface-variant',
  enviado: 'bg-primary/10 text-primary',
  aguardando_assinatura: 'bg-orange-status/10 text-orange-status',
  parcialmente_assinado: 'bg-tertiary/10 text-tertiary',
  assinado: 'bg-green-status/10 text-green-status',
  cancelado: 'bg-error/10 text-error',
  expirado: 'bg-surface-container text-on-surface-variant',
}

const DOC_STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-orange-status/10 text-orange-status',
  aprovado: 'bg-green-status/10 text-green-status',
  rejeitado: 'bg-error/10 text-error',
}

export default async function ClienteDetailPage({ params }: Props) {
  const { id } = await params
  const [aiConfig, cliente] = await Promise.all([
    getAiConfig(),
    prisma.cliente.findUnique({
      where: { id },
      include: {
        empresa: { include: { socios: true } },
        documentos: true,
        contratos: true,
        tarefas: { orderBy: { criadoEm: 'desc' }, take: 10 },
        responsavel: { select: { nome: true } },
        statusHistorico: { orderBy: { criadoEm: 'desc' }, take: 20 },
      },
    }),
  ])

  if (!cliente) notFound()
  const nomeIa = aiConfig.nomeAssistentes.crm ?? 'Assistente'

  // Conversas IA: pelo clienteId direto + pelo leadId de origem
  const leadIds = cliente.leadId ? [cliente.leadId] : []
  const conversas = await prisma.conversaIA.findMany({
    where: {
      OR: [
        { clienteId: id },
        ...(leadIds.length > 0 ? [{ leadId: { in: leadIds } }] : []),
      ],
    },
    orderBy: { atualizadaEm: 'desc' },
    include: {
      mensagens: { orderBy: { criadaEm: 'asc' } },
    },
  })

  const socios: NonNullable<typeof cliente.empresa>['socios'] = cliente.empresa?.socios ?? []
  const contratos  = cliente.contratos
  const isPJ       = cliente.tipoContribuinte === 'pj' || !!cliente.empresa?.cnpj

  // PJ: busca docs da empresa também; PF: só cliente
  const empresaDocs = (isPJ && cliente.empresa?.id)
    ? await prisma.documento.findMany({
        where:   { empresaId: cliente.empresa.id },
        orderBy: { criadoEm: 'desc' },
      })
    : []
  const documentos = [...cliente.documentos, ...empresaDocs]
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())

  const tabs = [
    { value: 'dados', label: 'Dados', count: null },
    { value: 'socios', label: 'Sócios', count: socios.length },
    { value: 'documentos', label: 'Documentos', count: documentos.length },
    { value: 'contratos', label: 'Contratos', count: contratos.length },
    { value: 'historico', label: 'Interações', count: null },
    { value: 'conversas', label: 'Conversas IA', count: conversas.length },
  ]

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link
          href="/crm/clientes"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline text-2xl font-semibold text-on-surface">{cliente.nome}</h1>
            <ClienteStatusSelect clienteId={cliente.id} status={cliente.status} />
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${PLANO_COLORS[cliente.planoTipo]}`}>
              {PLANO_LABELS[cliente.planoTipo]}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">payments</span>
              <span className="font-semibold text-on-surface">{formatBRL(Number(cliente.valorMensal))}</span>/mês
            </span>
            {cliente.empresa?.cnpj && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">badge</span>
                {formatCNPJ(cliente.empresa.cnpj)}
              </span>
            )}
            {cliente.cidade && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">location_on</span>
                {[cliente.cidade, cliente.uf].filter(Boolean).join('/')}
              </span>
            )}
            {cliente.responsavel && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">manage_accounts</span>
                {cliente.responsavel.nome}
              </span>
            )}
            {cliente.dataInicio && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                Cliente desde {formatDate(cliente.dataInicio)}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <EditarClienteButton cliente={{
              id: cliente.id,
              nome: cliente.nome,
              cpf: cliente.cpf,
              email: cliente.email,
              telefone: cliente.telefone,
              planoTipo: cliente.planoTipo,
              valorMensal: Number(cliente.valorMensal),
              vencimentoDia: cliente.vencimentoDia,
              formaPagamento: cliente.formaPagamento,
              cnpj: cliente.empresa?.cnpj ?? null,
              razaoSocial: cliente.empresa?.razaoSocial ?? null,
              regime: cliente.empresa?.regime ?? null,
              cidade: cliente.cidade,
              uf: cliente.uf,
              status: cliente.status,
            }} />
            <WhatsAppDrawerButton clienteId={cliente.id} clienteNome={cliente.nome} />
            <PortalChatButton clienteId={cliente.id} clienteNome={cliente.nome} status={cliente.status} />
            <PortalLinkButton clienteId={cliente.id} status={cliente.status} />
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <Tabs defaultValue="dados" className="w-full">
        {/* Tab bar (Sleek Pills) */}
        <div className="mb-6 overflow-x-auto custom-scrollbar pb-2">
          <TabsList className="inline-flex h-12 min-w-max items-center justify-start gap-1 rounded-full bg-surface-container/80 p-1 text-on-surface-variant ring-1 ring-inset ring-outline-variant/20">
            {tabs.map(({ value, label, count }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="inline-flex h-full items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-all data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-outline-variant/10 hover:text-on-surface"
              >
                {label}
                {count !== null && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums ${count > 0
                      ? 'bg-primary/10 text-primary'
                      : 'bg-outline-variant/20 text-on-surface-variant/80'
                      }`}
                  >
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Dados ───────────────────────────────────────── */}
        <TabsContent value="dados" className="m-0 focus-visible:outline-none">
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="Dados pessoais" icon="person">
              <InfoRow label="Nome completo" value={cliente.nome} />
              <InfoRow label="CPF" value={formatCPF(cliente.cpf)} />
              {cliente.rg && <InfoRow label="RG" value={cliente.rg} />}
              {cliente.dataNascimento && <InfoRow label="Nascimento" value={formatDate(cliente.dataNascimento)} />}
              {cliente.estadoCivil && <InfoRow label="Estado civil" value={cliente.estadoCivil} />}
              <InfoRow label="E-mail" value={cliente.email} />
              <InfoRow label="Telefone" value={formatTelefone(cliente.telefone)} />
              {cliente.whatsapp && <InfoRow label="WhatsApp" value={formatTelefone(cliente.whatsapp)} />}
            </InfoCard>

            <InfoCard title="Dados da empresa" icon="business">
              <InfoRow label="Plano" value={PLANO_LABELS[cliente.planoTipo]} />
              <InfoRow label="Valor mensal" value={formatBRL(Number(cliente.valorMensal))} />
              <InfoRow label="Vencimento" value={`Dia ${cliente.vencimentoDia}`} />
              <InfoRow label="Pagamento" value={FORMA_PAGAMENTO_LABELS[cliente.formaPagamento]} />
              {cliente.empresa?.regime && <InfoRow label="Regime" value={REGIME_LABELS[cliente.empresa.regime] ?? cliente.empresa.regime} />}
              {cliente.empresa?.cnpj && <InfoRow label="CNPJ" value={formatCNPJ(cliente.empresa.cnpj)} />}
              {cliente.empresa?.razaoSocial && <InfoRow label="Razão social" value={cliente.empresa.razaoSocial} />}
              {cliente.empresa?.nomeFantasia && <InfoRow label="Nome fantasia" value={cliente.empresa.nomeFantasia} />}
            </InfoCard>

            {(cliente.cep || cliente.cidade) && (
              <InfoCard title="Endereço" icon="location_on">
                {cliente.logradouro && (
                  <InfoRow
                    label="Logradouro"
                    value={`${cliente.logradouro}, ${cliente.numero}${cliente.complemento ? ` — ${cliente.complemento}` : ''}`}
                  />
                )}
                {cliente.bairro && <InfoRow label="Bairro" value={cliente.bairro} />}
                {cliente.cidade && <InfoRow label="Cidade" value={[cliente.cidade, cliente.uf].filter(Boolean).join('/')} />}
                {cliente.cep && <InfoRow label="CEP" value={cliente.cep} />}
              </InfoCard>
            )}

            <InfoCard title="Gestão" icon="manage_accounts">
              <InfoRow label="Status" value={STATUS_CLIENTE_LABELS[cliente.status]} />
              {cliente.responsavel && <InfoRow label="Responsável" value={cliente.responsavel.nome ?? ''} />}
              {cliente.dataInicio && <InfoRow label="Início" value={formatDate(cliente.dataInicio)} />}
              {(cliente as any).inativadoEm && (
                <InfoRow label="Inativado em" value={formatDate((cliente as any).inativadoEm)} />
              )}
              {(cliente as any).reativadoEm && (
                <InfoRow label="Reativado em" value={formatDate((cliente as any).reativadoEm)} />
              )}
              {(cliente as any).motivoInativacao && (
                <div className="pt-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Motivo inativação</p>
                  <p className="mt-1 text-sm leading-relaxed text-on-surface">{(cliente as any).motivoInativacao}</p>
                </div>
              )}
              {cliente.observacoesInternas && (
                <div className="pt-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Observações</p>
                  <p className="mt-1 text-sm leading-relaxed text-on-surface">{cliente.observacoesInternas}</p>
                </div>
              )}
            </InfoCard>
          </div>
        </TabsContent>

        {/* ── Sócios ─────────────────────────────────────── */}
        <TabsContent value="socios" className="m-0 focus-visible:outline-none">
          {socios.length === 0 ? (
            <EmptyState icon="group" msg="Nenhum sócio cadastrado" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {socios.map((s) => (
                <div key={s.id} className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span
                        className="material-symbols-outlined text-[18px] text-primary"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        person
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-on-surface">{s.nome}</p>
                        {s.principal && (
                          <span className="rounded-full bg-green-status/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-status">
                            Principal
                          </span>
                        )}
                      </div>
                      {s.qualificacao && (
                        <p className="text-sm text-on-surface-variant">{s.qualificacao}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-outline-variant/15 px-5 py-4 text-sm">
                    <InfoRow label="CPF" value={formatCPF(s.cpf)} />
                    {s.participacao && <InfoRow label="Participação" value={`${Number(s.participacao)}%`} />}
                    {s.email && <InfoRow label="E-mail" value={s.email} />}
                    {s.telefone && <InfoRow label="Telefone" value={formatTelefone(s.telefone)} />}
                  </div>
                  <div className="border-t border-outline-variant/10 px-5 py-3">
                    <SocioPortalControls
                      socioId={s.id}
                      temEmail={!!s.email}
                      portalAccess={s.portalAccess}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Documentos ─────────────────────────────────── */}
        <TabsContent value="documentos" className="m-0 focus-visible:outline-none">
          <div className="space-y-3">
            {isPJ && cliente.empresa && (
              <div className="flex items-center justify-between rounded-xl bg-surface-container-low/60 px-4 py-2.5">
                <span className="text-[12px] text-on-surface-variant/70">
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">info</span>
                  Inclui documentos vinculados à empresa. Veja todos na aba{' '}
                  <Link href={`/crm/empresas/${cliente.empresa.id}`} className="text-primary font-semibold hover:underline">
                    {cliente.empresa.razaoSocial ?? cliente.empresa.nomeFantasia}
                  </Link>
                </span>
              </div>
            )}

            {documentos.length === 0 ? (
              <EmptyState icon="folder_open" msg="Nenhum documento enviado" />
            ) : (
              <div className="divide-y divide-outline-variant/10 overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
                {documentos.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-container-low/30">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <span className="material-symbols-outlined text-[18px] text-primary">description</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-on-surface">{d.nome}</p>
                        <p className="text-xs text-on-surface-variant">
                          {d.tipo}
                          {d.tamanho ? ` · ${(d.tamanho / 1024).toFixed(0)} KB` : ''}
                          {` · ${formatDate(d.criadoEm)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {(d as any).origem && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          (d as any).origem === 'portal' ? 'bg-primary/10 text-primary' : 'bg-green-status/10 text-green-status'
                        }`}>
                          {(d as any).origem === 'portal' ? 'cliente' : (d as any).origem}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${DOC_STATUS_COLORS[d.status] ?? 'bg-surface-container text-on-surface-variant'}`}
                      >
                        {d.status}
                      </span>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Contratos ──────────────────────────────────── */}
        <TabsContent value="contratos" className="m-0 focus-visible:outline-none">
          {cliente.contratos.length === 0 ? (
            <EmptyState icon="contract" msg="Nenhum contrato gerado" />
          ) : (
            <div className="space-y-3">
              {cliente.contratos.map((c) => (
                <div
                  key={c.id}
                  className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                        <span
                          className="material-symbols-outlined text-[20px] text-primary"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          contract
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-on-surface">
                          Contrato — {PLANO_LABELS[c.planoTipo]}
                        </p>
                        <p className="text-sm text-on-surface-variant">
                          {formatBRL(Number(c.valorMensal))}/mês · Dia {c.vencimentoDia} ·{' '}
                          {FORMA_PAGAMENTO_LABELS[c.formaPagamento]}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_CONTRATO_COLORS[c.status] ?? 'bg-surface-container text-on-surface-variant'
                        }`}
                    >
                      {STATUS_CONTRATO_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-outline-variant/10 border-t border-outline-variant/15 bg-surface-container-low/30">
                    {(
                      [
                        { label: 'Gerado em', date: c.geradoEm },
                        { label: 'Enviado em', date: c.enviadoEm },
                        { label: 'Assinado em', date: c.assinadoEm },
                      ] as const
                    ).map(({ label, date }) => (
                      <div key={label} className="px-4 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                          {label}
                        </p>
                        <p className="mt-0.5 text-sm font-medium text-on-surface">
                          {date ? formatDate(date) : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                  {c.status === 'assinado' && (
                    <div className="border-t border-outline-variant/15 px-5 py-3">
                      {c.pdfUrl && c.leadId ? (
                        <a
                          href={`/api/leads/${c.leadId}/contrato/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-[13px] font-semibold text-primary hover:opacity-80"
                        >
                          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>picture_as_pdf</span>
                          Baixar contrato assinado
                          <span className="material-symbols-outlined ml-auto text-[16px] opacity-60">download</span>
                        </a>
                      ) : (
                        <ReprocessarPdfButton contratoId={c.id} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Conversas IA ───────────────────────────────── */}
        <TabsContent value="conversas" className="m-0 focus-visible:outline-none">
          <div className="mb-5">
            <p className="text-[13px] text-on-surface-variant">
              {conversas.length === 0
                ? 'Nenhuma conversa registrada nos últimos 90 dias'
                : `${conversas.length} ${conversas.length === 1 ? 'conversa' : 'conversas'} · ${conversas.reduce((acc: number, c: { mensagens: unknown[] }) => acc + c.mensagens.length, 0)} mensagens no total`}
            </p>
          </div>
          <ConversasIAList conversas={conversas} />
        </TabsContent>

        {/* ── Histórico ──────────────────────────────────── */}
        <TabsContent value="historico" className="m-0 focus-visible:outline-none">
          {/* Histórico de status */}
          {(cliente as any).statusHistorico?.length > 0 && (
            <div className="mb-6 overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-outline-variant/10">
                <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>history</span>
                <h3 className="font-headline text-base font-semibold text-on-surface">Histórico de status</h3>
              </div>
              <div className="divide-y divide-outline-variant/10">
                {(cliente as any).statusHistorico.map((h: any) => (
                  <div key={h.id} className="flex items-start gap-4 px-6 py-3.5">
                    <div className="mt-0.5 flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLIENTE_COLORS[h.statusAntes as StatusCliente] ?? ''}`}>
                        {STATUS_CLIENTE_LABELS[h.statusAntes as StatusCliente] ?? h.statusAntes}
                      </span>
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLIENTE_COLORS[h.statusDepois as StatusCliente] ?? ''}`}>
                        {STATUS_CLIENTE_LABELS[h.statusDepois as StatusCliente] ?? h.statusDepois}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {h.motivo && <p className="text-sm text-on-surface truncate">{h.motivo}</p>}
                      <p className="text-[12px] text-on-surface-variant">
                        {h.operadorNome ? `${h.operadorNome} · ` : ''}{formatDate(h.criadoEm)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mb-5 flex items-center justify-end gap-2">
            <EnviarEmailDrawer
              clienteId={cliente.id}
              leadId={cliente.leadId ?? undefined}
              clienteEmail={cliente.email}
              clienteNome={cliente.nome}
              documentos={cliente.documentos.map((d: any) => ({
                id: d.id, nome: d.nome, url: d.url,
                mimeType: d.mimeType ?? null, tipo: d.tipo,
              }))}
            />
            <NovaInteracaoDrawer clienteId={cliente.id} />
          </div>
          <HistoricoTimeline clienteId={cliente.id} nomeIa={nomeIa} />
        </TabsContent>
      </Tabs>

      <AssistenteContextSetter
        clienteId={cliente.id}
        leadId={cliente.leadId ?? undefined}
        nomeCliente={cliente.nome}
      />
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────── */

function InfoCard({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 pb-2 pt-6">
        <span
          className="material-symbols-outlined text-[20px] text-primary/80"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
        <h2 className="font-headline text-base font-semibold text-on-surface">{title}</h2>
      </div>
      <div className="flex-1 px-6 pb-6 pt-2">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-outline-variant/5 last:border-0">
      <span className="shrink-0 text-sm text-on-surface-variant/80">{label}</span>
      <span className="text-right text-sm font-medium text-on-surface">{value}</span>
    </div>
  )
}

function EmptyState({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 py-16 text-center">
      <span
        className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25"
        style={{ fontVariationSettings: "'FILL' 0" }}
      >
        {icon}
      </span>
      <p className="text-sm text-on-surface-variant">{msg}</p>
    </div>
  )
}
