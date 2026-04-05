import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getAiConfig } from '@/lib/ai/config'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssistenteContextSetter } from '@/components/crm/assistente-context'
import { EmpresaDocumentoUpload } from '@/components/crm/empresa-documento-upload'
import { DocumentosTabContent } from '@/components/crm/documentos-tab-content'
import { ConversasIAList } from '@/components/crm/conversas-ia-list'
import { NotasFiscaisTabContent } from '@/components/crm/notas-fiscais-tab'
import { PlaceholderTab } from '@/components/crm/info-card'
import { EmptyState } from '@/components/crm/info-card'
import { EmpresaHeader } from './_components/empresa-header'
import { TabVisaoGeral } from './_components/tab-visao-geral'
import { TabTitular } from './_components/tab-titular'
import { TabSocios } from './_components/tab-socios'
import { TabChamados } from './_components/tab-chamados'
import { TabPortal } from './_components/tab-portal'

type Props = { params: Promise<{ id: string }> }

export default async function EmpresaDetailPage({ params }: Props) {
  const { id } = await params

  const [aiConfig, empresa, escritorio] = await Promise.all([
    getAiConfig(),
    prisma.empresa.findUnique({
      where: { id },
      include: {
        documentos: { where: { deletadoEm: null }, orderBy: { criadoEm: 'desc' } },
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
        chamados: {
          orderBy: { criadoEm: 'desc' },
          include: { cliente: { select: { nome: true } } },
        },
        notasFiscais: {
          orderBy: { criadoEm: 'desc' as const },
          take: 20,
          select: { id: true, status: true, valorTotal: true, autorizadaEm: true, criadoEm: true, numero: true },
        },
      },
    }),
    prisma.escritorio.findFirst({ select: { spedyApiKey: true } }),
  ])

  if (!empresa) notFound()

  const cliente = empresa.cliente
  const socios = empresa.socios
  const nomeIaPortal = aiConfig.nomeAssistentes.portal ?? 'Assistente'

  // NFS-e stats
  const nfseAutorizadas = empresa.notasFiscais.filter(n => n.status === 'autorizada')
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const nfseMesValor = nfseAutorizadas
    .filter(n => (n.autorizadaEm ?? n.criadoEm) >= inicioMes)
    .reduce((acc, n) => acc + Number(n.valorTotal), 0)
  const nfseUltima = nfseAutorizadas[0] ?? null

  const chamadosAbertos = empresa.chamados.filter(c => !['resolvida', 'cancelada'].includes(c.status)).length

  const conversas = cliente
    ? await prisma.conversaIA.findMany({
        where: {
          OR: [
            { clienteId: cliente.id },
            ...(cliente.leadId ? [{ leadId: cliente.leadId }] : []),
          ],
        },
        orderBy: { atualizadaEm: 'desc' },
        include: { mensagens: { orderBy: { criadaEm: 'asc' } } },
      })
    : []

  const tabs = [
    { value: 'visao-geral',  label: 'Visão Geral',  count: null },
    { value: 'titular',      label: 'Titular',       count: null },
    { value: 'socios',       label: 'Sócios',        count: socios.length },
    { value: 'chamados',     label: 'Chamados',      count: empresa.chamados.length },
    { value: 'documentos',   label: 'Documentos',    count: empresa.documentos.length },
    { value: 'portal',       label: 'Portal',        count: null },
    { value: 'conversas',    label: 'Conversas IA',  count: conversas.length },
    { value: 'financeiro',   label: 'Financeiro',    count: null },
    { value: 'fiscal',       label: 'Fiscal',        count: null },
  ]

  const clienteParaHeader = cliente ? {
    id: cliente.id,
    nome: cliente.nome,
    cpf: cliente.cpf,
    email: cliente.email,
    telefone: cliente.telefone,
    whatsapp: cliente.whatsapp,
    rg: cliente.rg,
    dataNascimento: cliente.dataNascimento ? cliente.dataNascimento.toISOString() : null,
    estadoCivil: (cliente as any).estadoCivil ?? null,
    profissao: (cliente as any).profissao ?? null,
    nacionalidade: (cliente as any).nacionalidade ?? null,
    tipoContribuinte: cliente.tipoContribuinte,
    planoTipo: cliente.planoTipo,
    valorMensal: Number(cliente.valorMensal),
    vencimentoDia: cliente.vencimentoDia,
    formaPagamento: cliente.formaPagamento,
    cnpj: empresa.cnpj,
    razaoSocial: empresa.razaoSocial,
    regime: empresa.regime,
    cep: cliente.cep,
    logradouro: cliente.logradouro,
    numero: cliente.numero,
    complemento: cliente.complemento,
    bairro: cliente.bairro,
    cidade: cliente.cidade,
    uf: cliente.uf,
    status: cliente.status,
    observacoesInternas: cliente.observacoesInternas,
    leadId: cliente.leadId,
  } : null

  const clienteParaTitular = cliente ? {
    ...cliente,
    valorMensal: Number(cliente.valorMensal),
    estadoCivil: (cliente as any).estadoCivil ?? null,
    profissao: (cliente as any).profissao ?? null,
    nacionalidade: (cliente as any).nacionalidade ?? null,
    inativadoEm: (cliente as any).inativadoEm ?? null,
    reativadoEm: (cliente as any).reativadoEm ?? null,
    motivoInativacao: (cliente as any).motivoInativacao ?? null,
  } : null

  return (
    <div className="space-y-8 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <EmpresaHeader
        empresa={empresa}
        cliente={clienteParaHeader}
        sociosCount={socios.length}
        nomeIaPortal={nomeIaPortal}
      />

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

        <TabsContent value="visao-geral" className="m-0 focus-visible:outline-none">
          <TabVisaoGeral
            empresa={{ ...empresa, spedyConfigurado: empresa.spedyConfigurado ?? false }}
            cliente={cliente ? { ...cliente, valorMensal: Number(cliente.valorMensal) } : null}
            nfseAutorizadasCount={nfseAutorizadas.length}
            nfseMesValor={nfseMesValor}
            nfseUltima={nfseUltima ? { numero: nfseUltima.numero != null ? String(nfseUltima.numero) : null, valorTotal: Number(nfseUltima.valorTotal) } : null}
            chamadosAbertos={chamadosAbertos}
            chamadosTotal={empresa.chamados.length}
            documentosTotal={empresa.documentos.length}
            conversasTotal={conversas.length}
          />
        </TabsContent>

        <TabsContent value="titular" className="m-0 focus-visible:outline-none">
          <TabTitular cliente={clienteParaTitular} empresa={empresa} />
        </TabsContent>

        <TabsContent value="socios" className="m-0 focus-visible:outline-none">
          <TabSocios
            empresaId={empresa.id}
            socios={socios.map(s => ({ ...s, participacao: s.participacao != null ? Number(s.participacao) : null }))}
          />
        </TabsContent>

        <TabsContent value="chamados" className="m-0 focus-visible:outline-none">
          <TabChamados
            chamados={empresa.chamados}
            cliente={cliente ? { id: cliente.id, nome: cliente.nome } : null}
          />
        </TabsContent>

        <TabsContent value="documentos" className="m-0 focus-visible:outline-none">
          <DocumentosTabContent
            documentos={empresa.documentos.map(d => ({ ...d, criadoEm: d.criadoEm.toISOString(), tamanho: d.tamanho != null ? Number(d.tamanho) : null, xmlMetadata: d.xmlMetadata as unknown }))}
            uploadSlot={cliente ? <EmpresaDocumentoUpload clienteId={cliente.id} empresaId={empresa.id} /> : undefined}
          />
        </TabsContent>

        <TabsContent value="portal" className="m-0 focus-visible:outline-none">
          <TabPortal
            cliente={cliente ? { id: cliente.id, nome: cliente.nome, email: cliente.email, status: cliente.status } : null}
            socios={socios.map(s => ({ id: s.id, nome: s.nome, email: s.email, telefone: s.telefone, whatsapp: s.whatsapp, portalAccess: s.portalAccess }))}
          />
        </TabsContent>

        <TabsContent value="conversas" className="m-0 focus-visible:outline-none">
          {!cliente ? (
            <EmptyState icon="smart_toy" msg="Nenhum titular vinculado — sem conversas disponíveis" />
          ) : (
            <>
              <div className="mb-5">
                <p className="text-[13px] text-on-surface-variant">
                  {conversas.length === 0
                    ? 'Nenhuma conversa registrada nos últimos 90 dias'
                    : `${conversas.length} ${conversas.length === 1 ? 'conversa' : 'conversas'} · ${conversas.reduce((acc, c) => acc + c.mensagens.length, 0)} mensagens no total`}
                </p>
              </div>
              <ConversasIAList conversas={conversas} />
            </>
          )}
        </TabsContent>

        <TabsContent value="financeiro" className="m-0 focus-visible:outline-none">
          <PlaceholderTab icon="payments" label="Financeiro" descricao="Honorários, faturas, inadimplência e histórico de pagamentos." />
        </TabsContent>

        <TabsContent value="fiscal" className="m-0 focus-visible:outline-none">
          {!cliente ? (
            <EmptyState icon="receipt_long" msg="Nenhum titular vinculado — emissão de NFS-e indisponível" />
          ) : (
            <NotasFiscaisTabContent
              clienteId={cliente.id}
              spedyConfigurado={!!empresa.spedyConfigurado}
              escritorioSpedyOk={!!escritorio?.spedyApiKey}
            />
          )}
        </TabsContent>
      </Tabs>

      {cliente && (
        <AssistenteContextSetter
          clienteId={cliente.id}
          leadId={cliente.leadId ?? undefined}
          nomeCliente={cliente.nome}
        />
      )}
    </div>
  )
}
