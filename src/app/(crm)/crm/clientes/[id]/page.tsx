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
import { BackButton } from '@/components/ui/back-button'
import { NovaInteracaoDrawer } from '@/components/crm/nova-interacao-drawer'
import { AssistenteContextSetter } from '@/components/crm/assistente-context'
import { WhatsAppDrawerButton } from '@/components/crm/whatsapp-drawer-button'
import { PortalLinkButton } from '@/components/crm/portal-link-button'
import { PortalChatButton } from '@/components/crm/portal-chat-button'
import { HistoricoTimeline } from '@/components/crm/historico-timeline'
import { ClienteStatusSelect } from '@/components/crm/cliente-status-select'
import { ReprocessarPdfButton } from '@/components/crm/reprocessar-pdf-button'
import { EditarClienteButton } from '@/components/crm/editar-cliente-button'
import { SocioPortalControls } from '@/components/crm/socio-portal-controls'
import { DocumentosTabContent } from '@/components/crm/documentos-tab-content'
import { DocumentoUpload } from '@/components/crm/documento-upload'
import { EnviarEmailDrawer } from '@/components/crm/enviar-email-drawer'
import { ClienteFinanceiroTab } from '@/components/crm/cliente-financeiro-tab'
import { NotasFiscaisTabContent } from '@/components/crm/notas-fiscais-tab'
import { RegistrarEmpresaButton } from '@/components/crm/registrar-empresa-button'
import { AdicionarEmpresaButton } from '@/components/crm/adicionar-empresa-button'
import { EmpresasAccordion } from '@/components/crm/empresas-accordion'

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
  const [aiConfig, cliente, escritorio] = await Promise.all([
    getAiConfig(),
    prisma.cliente.findUnique({
      where: { id },
      include: {
        empresa: { include: { socios: true } },
        clienteEmpresas: {
          include: { empresa: { include: { socios: true } } },
          orderBy: { principal: 'desc' },
        },
        documentos: { where: { deletadoEm: null } },
        contratos: true,
        responsavel: { select: { nome: true } },
        statusHistorico: { orderBy: { criadoEm: 'desc' }, take: 20 },
      },
    }),
    prisma.escritorio.findFirst({ select: { spedyApiKey: true } }),
  ])

  if (!cliente) notFound()
  const nomeIa = aiConfig.nomeAssistentes.crm ?? 'Assistente'
  const nomeIaPortal = aiConfig.nomeAssistentes.portal ?? 'Assistente'


  const empresaVinculos = cliente.clienteEmpresas ?? []
  // Sócios: agrega de todas as empresas vinculadas
  const socios = empresaVinculos.flatMap(v => v.empresa.socios)
  const contratos = cliente.contratos
  const isPJ = cliente.tipoContribuinte === 'pj' || !!cliente.empresa?.cnpj || empresaVinculos.length > 0
  const semEmpresa = empresaVinculos.length === 0 && !cliente.empresa

  // PJ: busca docs de TODAS as empresas vinculadas; PF: só cliente
  const empresaIds = empresaVinculos.map(v => v.empresaId)
  const empresaDocs = empresaIds.length > 0
    ? await prisma.documento.findMany({
      where: { empresaId: { in: empresaIds }, deletadoEm: null },
      orderBy: { criadoEm: 'desc' },
    })
    : []
  const documentos = [...cliente.documentos, ...empresaDocs]
    .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())

  const escritorioSpedyOk = !!escritorio?.spedyApiKey
  const spedyConfigurado = !!empresaVinculos[0]?.empresa?.spedyConfigurado || !!cliente?.empresa?.spedyConfigurado

  const tabs = [
    { value: 'dados', label: 'Dados', count: null },
    { value: 'financeiro', label: 'Financeiro', count: null },
    { value: 'socios', label: 'Sócios', count: socios.length },
    { value: 'documentos', label: 'Documentos', count: documentos.length },
    { value: 'contratos', label: 'Contratos', count: contratos.length },
    { value: 'nfse', label: 'Notas Fiscais', count: null },
    { value: 'historico', label: 'Interações', count: null },
  ]

  return (
    <div key={id} className="space-y-8 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <BackButton className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </BackButton>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface">{cliente.nome}</h1>
            <ClienteStatusSelect clienteId={cliente.id} status={cliente.status} />
            <span className={`rounded-[4px] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${PLANO_COLORS[cliente.planoTipo]} border border-current/10`}>
              {PLANO_LABELS[cliente.planoTipo]}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">payments</span>
              <span className="font-semibold text-on-surface">{formatBRL(Number(cliente.valorMensal))}</span>/mês
            </span>
            {(empresaVinculos[0]?.empresa.cnpj ?? cliente.empresa?.cnpj) && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">badge</span>
                {formatCNPJ(empresaVinculos[0]?.empresa.cnpj ?? cliente.empresa?.cnpj ?? '')}
                {empresaVinculos.length > 1 && (
                  <span className="text-[10px] text-on-surface-variant/50">+{empresaVinculos.length - 1}</span>
                )}
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EditarClienteButton cliente={{
              id: cliente.id,
              nome: cliente.nome,
              cpf: cliente.cpf,
              email: cliente.email,
              telefone: cliente.telefone,
              whatsapp: cliente.whatsapp,
              rg: cliente.rg,
              dataNascimento: cliente.dataNascimento ? cliente.dataNascimento.toISOString() : null,
              estadoCivil: cliente.estadoCivil,
              profissao: cliente.profissao,
              nacionalidade: cliente.nacionalidade,
              tipoContribuinte: cliente.tipoContribuinte,
              planoTipo: cliente.planoTipo,
              valorMensal: Number(cliente.valorMensal),
              vencimentoDia: cliente.vencimentoDia,
              formaPagamento: cliente.formaPagamento,
              cnpj: empresaVinculos[0]?.empresa.cnpj ?? cliente.empresa?.cnpj ?? null,
              razaoSocial: empresaVinculos[0]?.empresa.razaoSocial ?? cliente.empresa?.razaoSocial ?? null,
              regime: empresaVinculos[0]?.empresa.regime ?? cliente.empresa?.regime ?? null,
              cep: cliente.cep,
              logradouro: cliente.logradouro,
              numero: cliente.numero,
              complemento: cliente.complemento,
              bairro: cliente.bairro,
              cidade: cliente.cidade,
              uf: cliente.uf,
              status: cliente.status,
              observacoesInternas: cliente.observacoesInternas,
            }} />
            <WhatsAppDrawerButton clienteId={cliente.id} clienteNome={cliente.nome} />
            {cliente.email && (
              <EnviarEmailDrawer
                clienteId={cliente.id}
                clienteEmail={cliente.email}
                clienteNome={cliente.nome}
              />
            )}
            <PortalChatButton clienteId={cliente.id} clienteNome={cliente.nome} status={cliente.status} nomeIa={nomeIaPortal} />
            <PortalLinkButton clienteId={cliente.id} status={cliente.status} />
          </div>

          {/* Banner de alerta: MEI sem procuração RF ativa */}
          {empresaVinculos.some(v => v.empresa.regime === 'MEI' && !v.empresa.procuracaoRFAtiva) && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-error/25 bg-error/10 px-4 py-3">
              <span className="material-symbols-outlined shrink-0 text-[18px] text-error mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>lock_person</span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-error">Procuração RF não ativa</p>
                <p className="mt-0.5 text-[12px] text-error/80 leading-relaxed">
                  {empresaVinculos.filter(v => v.empresa.regime === 'MEI' && !v.empresa.procuracaoRFAtiva).length === 1 ? 'Uma empresa' : 'Algumas empresas'}
                  {' '}MEI deste cliente ainda não concederam procuração digital ao escritório no e-CAC.
                  Sem ela, a DAS MEI não pode ser gerada automaticamente.
                  Oriente o cliente a acessar o Portal e-CAC e conceder a procuração.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <Tabs defaultValue="dados" className="w-full">
        {/* Tab bar (Sleek Pills) */}
        <div className="mb-8 overflow-x-auto custom-scrollbar pb-2">
          <TabsList className="inline-flex h-12 min-w-max items-center justify-start gap-1 rounded-full bg-surface-container-lowest/80 p-1 text-on-surface-variant ring-1 ring-inset ring-outline-variant/10">
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

            <InfoCard title="Plano" icon="credit_card">
              <InfoRow label="Plano" value={PLANO_LABELS[cliente.planoTipo]} />
              <InfoRow label="Valor mensal" value={formatBRL(Number(cliente.valorMensal))} />
              <InfoRow label="Vencimento" value={`Dia ${cliente.vencimentoDia}`} />
              <InfoRow label="Pagamento" value={FORMA_PAGAMENTO_LABELS[cliente.formaPagamento]} />
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

          {/* Empresas vinculadas (accordion) */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-[13px] font-bold uppercase tracking-widest text-on-surface-variant">
                Empresas ({empresaVinculos.length})
              </h3>
              <AdicionarEmpresaButton clienteId={cliente.id} clienteNome={cliente.nome} />
            </div>
            {empresaVinculos.length > 0 ? (
              <EmpresasAccordion vinculos={empresaVinculos} />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 py-10 text-center">
                <span className="material-symbols-outlined mb-2 text-[32px] text-on-surface-variant/25">business</span>
                <p className="text-sm text-on-surface-variant/60">Nenhuma empresa vinculada</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Financeiro ─────────────────────────────────── */}
        <TabsContent value="financeiro" className="m-0 focus-visible:outline-none">
          <ClienteFinanceiroTab
            clienteId={cliente.id}
            vencimentoDia={cliente.vencimentoDia}
            formaPagamento={cliente.formaPagamento}
            valorMensal={Number(cliente.valorMensal)}
            regime={empresaVinculos[0]?.empresa.regime ?? cliente.empresa?.regime ?? null}
          />
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
          <DocumentosTabContent
            documentos={documentos.map(d => ({ ...d, criadoEm: d.criadoEm.toISOString(), tamanho: d.tamanho != null ? Number(d.tamanho) : null, xmlMetadata: (d as any).xmlMetadata as unknown, visualizadoEm: d.visualizadoEm?.toISOString() ?? null, dataVencimento: d.dataVencimento?.toISOString() ?? null }))}
            uploadSlot={<DocumentoUpload
              clienteId={cliente.id}
              empresaId={empresaVinculos[0]?.empresaId ?? cliente.empresa?.id}
              empresas={empresaVinculos.length > 1 ? empresaVinculos.map(v => ({
                id: v.empresaId,
                label: v.empresa.nomeFantasia ?? v.empresa.razaoSocial ?? v.empresa.cnpj ?? v.empresaId.slice(0, 8),
              })) : undefined}
            />}
            empresaLink={isPJ && (empresaVinculos.length > 0 || cliente.empresa) ? (
              <div className="flex items-center rounded-xl bg-surface-container-low/60 px-4 py-2.5">
                <span className="text-[12px] text-on-surface-variant/70">
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">info</span>
                  Inclui documentos da empresa.{' '}
                  <Link href={`/crm/empresas/${empresaVinculos[0]?.empresaId ?? cliente.empresa?.id}`} className="text-primary font-semibold hover:underline">
                    Ver na aba Empresa →
                  </Link>
                </span>
              </div>
            ) : undefined}
          />
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
            <NovaInteracaoDrawer clienteId={cliente.id} />
          </div>
          <HistoricoTimeline clienteId={cliente.id} nomeIa={nomeIa} />
        </TabsContent>

        {/* ── Notas Fiscais ────────────────────────────────── */}
        <TabsContent value="nfse" className="m-0 focus-visible:outline-none">
          {!isPJ && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-orange-status/20 bg-orange-status/10 px-4 py-3 text-sm text-orange-status">
              <span className="material-symbols-outlined shrink-0 text-[18px]">info</span>
              NFS-e não se aplica a pessoas físicas. Este cliente não possui CNPJ.
            </div>
          )}
          <NotasFiscaisTabContent
            clienteId={cliente.id}
            spedyConfigurado={spedyConfigurado}
            escritorioSpedyOk={escritorioSpedyOk}
          />
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
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm flex flex-col h-full transition-colors hover:border-outline-variant/40">
      <div className="flex items-center gap-2.5 px-6 pb-2 pt-6 border-b border-outline-variant/5">
        <span
          className="material-symbols-outlined text-[18px] text-on-surface-variant/50"
        >
          {icon}
        </span>
        <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest text-on-surface-variant">{title}</h2>
      </div>
      <div className="flex-1 px-6 pb-6 pt-3">{children}</div>
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
