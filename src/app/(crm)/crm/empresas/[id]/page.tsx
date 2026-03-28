import type { ReactNode } from 'react'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { formatCNPJ, formatCPF, formatBRL, formatDate, formatTelefone } from '@/lib/utils'
import { PLANO_LABELS, PLANO_COLORS, FORMA_PAGAMENTO_LABELS } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { SocioPortalControls } from '@/components/crm/socio-portal-controls'
import { EditarEmpresaButton } from '@/components/crm/editar-empresa-button'
import { PortalLinkButton } from '@/components/crm/portal-link-button'
import { WhatsAppDrawerButton } from '@/components/crm/whatsapp-drawer-button'
import { EmpresaDocumentoUpload } from '@/components/crm/empresa-documento-upload'
import { SocioWhatsAppButton } from '@/components/crm/socio-whatsapp-button'
import { DocumentosTabContent } from '@/components/crm/documentos-tab-content'

type Props = { params: Promise<{ id: string }> }

const REGIME_LABELS: Record<string, string> = {
  MEI: 'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido: 'Lucro Presumido',
  LucroReal: 'Lucro Real',
  Autonomo: 'Autônomo',
}

const REGIME_COLORS: Record<string, string> = {
  MEI: 'bg-green-status/10 text-green-status',
  SimplesNacional: 'bg-primary/10 text-primary',
  LucroPresumido: 'bg-tertiary/10 text-tertiary',
  LucroReal: 'bg-orange-status/10 text-orange-status',
  Autonomo: 'bg-surface-container text-on-surface-variant',
}

const STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-status/10 text-green-status',
  inativo: 'bg-error/10 text-error',
  inadimplente: 'bg-orange-status/10 text-orange-status',
  rescindido: 'bg-surface-container text-on-surface-variant',
  suspenso: 'bg-tertiary/10 text-tertiary',
}

const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  inadimplente: 'Inadimplente',
  rescindido: 'Rescindido',
  suspenso: 'Suspenso',
}

export default async function EmpresaDetailPage({ params }: Props) {
  const { id } = await params

  const empresa = await prisma.empresa.findUnique({
    where: { id },
    include: {
      documentos: { orderBy: { criadoEm: 'desc' } },
      cliente: {
        include: {
          contratos: true,
          responsavel: { select: { nome: true } },
        },
      },
      socios: true,
      portalTokens: {
        where: { expiresAt: { gt: new Date() } },
        orderBy: { criadoEm: 'desc' },
      },
    },
  })

  if (!empresa) notFound()

  const cliente = empresa.cliente
  const socios  = empresa.socios
  const nomeDisplay = empresa.razaoSocial ?? empresa.nomeFantasia ?? '(sem nome)'

  const documentos = empresa.documentos

  const tabs = [
    { value: 'visao-geral', label: 'Visão Geral',  count: null },
    { value: 'titular',     label: 'Titular',       count: null },
    { value: 'socios',      label: 'Sócios',        count: socios.length },
    { value: 'documentos',  label: 'Documentos',    count: documentos.length },
    { value: 'portal',      label: 'Portal',        count: null },
    { value: 'financeiro',  label: 'Financeiro',    count: null },
    { value: 'fiscal',      label: 'Fiscal',        count: null },
  ]

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Link
          href="/crm/empresas"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline text-2xl font-semibold text-on-surface">{nomeDisplay}</h1>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[empresa.status] ?? 'bg-surface-container text-on-surface-variant'}`}>
              {STATUS_LABELS[empresa.status] ?? empresa.status}
            </span>
            {empresa.regime && (
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${REGIME_COLORS[empresa.regime] ?? 'bg-surface-container text-on-surface-variant'}`}>
                {REGIME_LABELS[empresa.regime] ?? empresa.regime}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-on-surface-variant">
            {empresa.cnpj && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">badge</span>
                {formatCNPJ(empresa.cnpj)}
              </span>
            )}
            {empresa.nomeFantasia && empresa.razaoSocial && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">storefront</span>
                {empresa.nomeFantasia}
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">group</span>
              {socios.length} {socios.length === 1 ? 'sócio' : 'sócios'}
            </span>
            {cliente && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">person</span>
                {cliente.nome}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <EditarEmpresaButton empresa={{
              id: empresa.id,
              razaoSocial: empresa.razaoSocial,
              nomeFantasia: empresa.nomeFantasia,
              cnpj: empresa.cnpj,
              regime: empresa.regime,
              status: empresa.status,
            }} />
            {cliente && (
              <>
                <WhatsAppDrawerButton clienteId={cliente.id} clienteNome={cliente.nome} />
                <PortalLinkButton clienteId={cliente.id} status={cliente.status} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <Tabs defaultValue="visao-geral" className="w-full">
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
                  <span className={`ml-1.5 rounded-full px-1.5 py-[1px] text-[10px] font-bold tabular-nums ${count > 0 ? 'bg-primary/10 text-primary' : 'bg-outline-variant/20 text-on-surface-variant/80'}`}>
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Visão Geral ─────────────────────────────────── */}
        <TabsContent value="visao-geral" className="m-0 focus-visible:outline-none">
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="Dados da empresa" icon="domain">
              {empresa.razaoSocial && <InfoRow label="Razão social" value={empresa.razaoSocial} />}
              {empresa.nomeFantasia && <InfoRow label="Nome fantasia" value={empresa.nomeFantasia} />}
              {empresa.cnpj && <InfoRow label="CNPJ" value={formatCNPJ(empresa.cnpj)} />}
              {empresa.regime && <InfoRow label="Regime tributário" value={REGIME_LABELS[empresa.regime] ?? empresa.regime} />}
              <InfoRow label="Status" value={STATUS_LABELS[empresa.status] ?? empresa.status} />
              <InfoRow label="Cadastrada em" value={formatDate(empresa.criadoEm)} />
            </InfoCard>

            <InfoCard title="Composição societária" icon="group">
              {socios.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-2">Nenhum sócio cadastrado.</p>
              ) : (
                <div className="space-y-3 pt-1">
                  {socios.map(s => (
                    <div key={s.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-on-surface">{s.nome}</p>
                        {s.qualificacao && <p className="text-xs text-on-surface-variant">{s.qualificacao}</p>}
                      </div>
                      {s.participacao && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                          {Number(s.participacao)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </InfoCard>
          </div>
        </TabsContent>

        {/* ── Titular ─────────────────────────────────────── */}
        <TabsContent value="titular" className="m-0 focus-visible:outline-none">
          {!cliente ? (
            <EmptyState icon="person" msg="Nenhum titular vinculado a esta empresa" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard title="Dados pessoais" icon="person">
                <InfoRow label="Nome completo" value={cliente.nome} />
                <InfoRow label="CPF" value={formatCPF(cliente.cpf)} />
                <InfoRow label="E-mail" value={cliente.email} />
                <InfoRow label="Telefone" value={formatTelefone(cliente.telefone)} />
                {cliente.responsavel && <InfoRow label="Responsável" value={cliente.responsavel.nome ?? ''} />}
                {cliente.dataInicio && <InfoRow label="Cliente desde" value={formatDate(cliente.dataInicio)} />}
              </InfoCard>

              <InfoCard title="Contrato" icon="contract">
                <InfoRow label="Plano" value={PLANO_LABELS[cliente.planoTipo]} />
                <InfoRow label="Valor mensal" value={formatBRL(Number(cliente.valorMensal))} />
                <InfoRow label="Vencimento" value={`Dia ${cliente.vencimentoDia}`} />
                <InfoRow label="Pagamento" value={FORMA_PAGAMENTO_LABELS[cliente.formaPagamento]} />
                <div className="pt-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLANO_COLORS[cliente.planoTipo]}`}>
                    {PLANO_LABELS[cliente.planoTipo]}
                  </span>
                  <Link
                    href={`/crm/clientes/${cliente.id}`}
                    className="text-[12px] font-semibold text-primary hover:opacity-80 flex items-center gap-1"
                  >
                    Ver perfil completo
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>
              </InfoCard>
            </div>
          )}
        </TabsContent>

        {/* ── Sócios ──────────────────────────────────────── */}
        <TabsContent value="socios" className="m-0 focus-visible:outline-none">
          {socios.length === 0 ? (
            <EmptyState icon="group" msg="Nenhum sócio cadastrado nesta empresa" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {socios.map((s) => (
                <div key={s.id} className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
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
                      {s.qualificacao && <p className="text-sm text-on-surface-variant">{s.qualificacao}</p>}
                    </div>
                  </div>
                  <div className="space-y-2 border-t border-outline-variant/15 px-5 py-4 text-sm">
                    <InfoRow label="CPF" value={formatCPF(s.cpf)} />
                    {s.participacao && <InfoRow label="Participação" value={`${Number(s.participacao)}%`} />}
                    {s.email && <InfoRow label="E-mail" value={s.email} />}
                    {s.telefone && <InfoRow label="Telefone" value={formatTelefone(s.telefone)} />}
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-outline-variant/10 px-5 py-3">
                    <SocioPortalControls socioId={s.id} temEmail={!!s.email} portalAccess={s.portalAccess} />
                    <SocioWhatsAppButton
                      socioId={s.id}
                      socioNome={s.nome}
                      telefone={s.telefone}
                      whatsapp={s.whatsapp}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Documentos ──────────────────────────────────── */}
        <TabsContent value="documentos" className="m-0 focus-visible:outline-none">
          <DocumentosTabContent
            documentos={documentos.map(d => ({ ...d, criadoEm: d.criadoEm.toISOString(), xmlMetadata: d.xmlMetadata as unknown }))}
            uploadSlot={cliente ? <EmpresaDocumentoUpload clienteId={cliente.id} empresaId={empresa.id} /> : undefined}
          />
        </TabsContent>

        {/* ── Portal ──────────────────────────────────────── */}
        <TabsContent value="portal" className="m-0 focus-visible:outline-none">
          <div className="space-y-3">
            {/* Titular */}
            {cliente && (
              <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{cliente.nome}</p>
                      <p className="text-xs text-on-surface-variant">{cliente.email} · Titular</p>
                    </div>
                  </div>
                  <PortalLinkButton clienteId={cliente.id} status={cliente.status} />
                </div>
              </div>
            )}

            {/* Sócios */}
            {socios.map(s => (
              <div key={s.id} className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm">
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container">
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{s.nome}</p>
                      <p className="text-xs text-on-surface-variant">{s.email ?? 'sem e-mail'} · Sócio</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <SocioWhatsAppButton
                      socioId={s.id}
                      socioNome={s.nome}
                      telefone={s.telefone}
                      whatsapp={s.whatsapp}
                    />
                    <SocioPortalControls socioId={s.id} temEmail={!!s.email} portalAccess={s.portalAccess} />
                  </div>
                </div>
              </div>
            ))}

            {!cliente && socios.length === 0 && (
              <EmptyState icon="lock" msg="Nenhuma pessoa vinculada a esta empresa" />
            )}
          </div>
        </TabsContent>

        {/* ── Financeiro ──────────────────────────────────── */}
        <TabsContent value="financeiro" className="m-0 focus-visible:outline-none">
          <PlaceholderTab icon="payments" label="Financeiro" descricao="Honorários, faturas, inadimplência e histórico de pagamentos." />
        </TabsContent>

        {/* ── Fiscal ──────────────────────────────────────── */}
        <TabsContent value="fiscal" className="m-0 focus-visible:outline-none">
          <PlaceholderTab icon="receipt_long" label="Fiscal" descricao="Obrigações fiscais, competências, DAS, DCTF, apurações e calendário tributário." />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────── */

function InfoCard({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-card shadow-sm flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 pb-2 pt-6">
        <span className="material-symbols-outlined text-[20px] text-primary/80" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
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
      <span className="material-symbols-outlined mb-3 text-[40px] text-on-surface-variant/25" style={{ fontVariationSettings: "'FILL' 0" }}>{icon}</span>
      <p className="text-sm text-on-surface-variant">{msg}</p>
    </div>
  )
}

function PlaceholderTab({ icon, label, descricao }: { icon: string; label: string; descricao: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 py-20 text-center gap-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container">
        <span className="material-symbols-outlined text-[28px] text-on-surface-variant/40" style={{ fontVariationSettings: "'FILL' 0" }}>{icon}</span>
      </div>
      <div>
        <p className="font-semibold text-on-surface-variant">{label} — em breve</p>
        <p className="mt-1 text-sm text-on-surface-variant/60 max-w-sm">{descricao}</p>
      </div>
    </div>
  )
}
