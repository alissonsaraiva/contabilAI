// Ingestão automática de entidades relacionais no RAG
// Chamado em background após creates/updates — não bloqueia respostas

import { chunkText, embedTexts, storeEmbeddings, deleteEmbeddings } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'
import { getAiConfig } from '@/lib/ai/config'

// Planos do escritório — definição canônica usada tanto no onboarding quanto no RAG
export const PLANOS_INFO = [
  {
    tipo: 'essencial',
    nome: 'Essencial',
    desc: 'Ideal para MEI e microempresas',
    faixaPreco: 'R$ 179 – R$ 299/mês',
    servicos: [
      'Obrigações fiscais acessórias',
      'Geração de DAS automática',
      'Portal básico do cliente',
      'Chatbot de dúvidas 24h',
      'Alertas de prazo por WhatsApp',
    ],
  },
  {
    tipo: 'profissional',
    nome: 'Profissional',
    desc: 'Para empresas do Simples Nacional',
    faixaPreco: 'R$ 449 – R$ 699/mês',
    servicos: [
      'Tudo do Essencial',
      'Depto. pessoal (até 3 funcionários)',
      'DRE simplificado mensal',
      'Fluxo de caixa',
      'Relatório narrativo com IA',
    ],
  },
  {
    tipo: 'empresarial',
    nome: 'Empresarial',
    desc: 'Para Lucro Presumido e Real',
    faixaPreco: 'R$ 990 – R$ 1.800/mês',
    servicos: [
      'Tudo do Profissional',
      'Depto. pessoal ilimitado',
      'KPIs avançados e dashboards',
      'Consultoria mensal de 1h',
      'Simulação de cenários tributários',
    ],
  },
  {
    tipo: 'startup',
    nome: 'Startup',
    desc: 'Para empresas digitais em crescimento',
    faixaPreco: 'R$ 1.200 – R$ 2.500/mês',
    servicos: [
      'Tudo do Empresarial',
      'Relatórios para investidores',
      'Benchmark setorial com IA',
      'Suporte prioritário',
      'Planejamento tributário estratégico',
    ],
  },
]

async function getVoyageKey(): Promise<string | null> {
  try {
    const cfg = await getAiConfig()
    return cfg.voyageApiKey
  } catch {
    return process.env.VOYAGE_API_KEY ?? null
  }
}

async function indexar(
  texto: string,
  row: Omit<EmbeddingRow, 'conteudo'>,
  voyageKey: string,
): Promise<void> {
  const chunks = chunkText(texto)
  if (!chunks.length) return

  // Deleta embeddings antigos para o mesmo documento antes de re-indexar
  if (row.documentoId) {
    await deleteEmbeddings({ documentoId: row.documentoId })
  } else if (row.leadId && row.tipo) {
    await deleteEmbeddings({ leadId: row.leadId, tipo: row.tipo })
  } else if (row.clienteId && row.tipo) {
    await deleteEmbeddings({ clienteId: row.clienteId, tipo: row.tipo })
  }

  const embeddings = await embedTexts(chunks, voyageKey)
  const rows: EmbeddingRow[] = chunks.map((conteudo, i) => ({
    ...row,
    conteudo,
    metadata: { chunkIndex: i, totalChunks: chunks.length },
  }))

  await storeEmbeddings(rows, embeddings)
}

// ─── Lead ──────────────────────────────────────────────────────────────────

type LeadData = {
  id: string
  contatoEntrada: string
  canal?: string | null
  status?: string | null
  planoTipo?: string | null
  dadosJson?: unknown
}

export async function indexarLead(lead: LeadData): Promise<void> {
  const key = await getVoyageKey()
  if (!key) return

  const dados = (lead.dadosJson ?? {}) as Record<string, string>

  const linhas = [
    `Lead de onboarding`,
    `Contato: ${lead.contatoEntrada}`,
    lead.canal       ? `Canal de entrada: ${lead.canal}` : '',
    lead.status      ? `Status: ${lead.status}` : '',
    lead.planoTipo   ? `Plano de interesse: ${lead.planoTipo}` : '',
    dados['Nome completo']  ? `Nome: ${dados['Nome completo']}` : '',
    dados['CPF']            ? `CPF: ${dados['CPF']}` : '',
    dados['E-mail']         ? `E-mail: ${dados['E-mail']}` : '',
    dados['Telefone']       ? `Telefone: ${dados['Telefone']}` : '',
    dados['CNPJ']           ? `CNPJ: ${dados['CNPJ']}` : '',
    dados['Razão Social']   ? `Razão Social: ${dados['Razão Social']}` : '',
    dados['Nome Fantasia']  ? `Nome Fantasia: ${dados['Nome Fantasia']}` : '',
    dados['Cidade']         ? `Cidade: ${dados['Cidade']}` : '',
    dados['Endereço de Faturamento'] ? `Endereço: ${dados['Endereço de Faturamento']}` : '',
    dados['Regime Tributário']       ? `Regime: ${dados['Regime Tributário']}` : '',
    dados['Atividade Principal']     ? `Atividade: ${dados['Atividade Principal']}` : '',
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo: 'lead',
    canal: 'onboarding',
    tipo: 'dados_lead',
    leadId: lead.id,
    titulo: dados['Nome completo'] ?? lead.contatoEntrada,
  }, key)
}

// ─── Cliente ───────────────────────────────────────────────────────────────

type SocioData = {
  nome: string
  cpf: string
  qualificacao?: string | null
  participacao?: unknown
  email?: string | null
  telefone?: string | null
  principal?: boolean
}

type ClienteData = {
  id: string
  nome: string
  email: string
  cpf?: string | null
  telefone?: string | null
  whatsapp?: string | null
  cnpj?: string | null
  razaoSocial?: string | null
  nomeFantasia?: string | null
  regime?: string | null
  planoTipo?: string | null
  valorMensal?: unknown
  vencimentoDia?: number | null
  formaPagamento?: string | null
  cidade?: string | null
  uf?: string | null
  socios?: SocioData[]
}

export async function indexarCliente(cliente: ClienteData): Promise<void> {
  const key = await getVoyageKey()
  if (!key) return

  const sociosLinhas = (cliente.socios ?? []).map(s => [
    `  - ${s.nome} (CPF: ${s.cpf})${s.principal ? ' — sócio principal' : ''}`,
    s.qualificacao   ? `    Qualificação: ${s.qualificacao}` : '',
    s.participacao != null ? `    Participação: ${s.participacao}%` : '',
    s.email          ? `    E-mail: ${s.email}` : '',
    s.telefone       ? `    Telefone: ${s.telefone}` : '',
  ].filter(Boolean).join('\n'))

  const linhas = [
    `Dados do cliente`,
    `Nome: ${cliente.nome}`,
    cliente.cpf          ? `CPF: ${cliente.cpf}` : '',
    `E-mail: ${cliente.email}`,
    cliente.telefone     ? `Telefone: ${cliente.telefone}` : '',
    cliente.whatsapp     ? `WhatsApp: ${cliente.whatsapp}` : '',
    cliente.cnpj         ? `CNPJ: ${cliente.cnpj}` : '',
    cliente.razaoSocial  ? `Razão Social: ${cliente.razaoSocial}` : '',
    cliente.nomeFantasia ? `Nome Fantasia: ${cliente.nomeFantasia}` : '',
    cliente.regime       ? `Regime tributário: ${cliente.regime}` : '',
    cliente.planoTipo    ? `Plano: ${cliente.planoTipo}` : '',
    cliente.valorMensal  ? `Valor mensal: R$ ${cliente.valorMensal}` : '',
    cliente.vencimentoDia ? `Vencimento: dia ${cliente.vencimentoDia}` : '',
    cliente.formaPagamento ? `Forma de pagamento: ${cliente.formaPagamento}` : '',
    (cliente.cidade || cliente.uf) ? `Cidade: ${[cliente.cidade, cliente.uf].filter(Boolean).join(' / ')}` : '',
    ...(sociosLinhas.length ? [`Sócios (${sociosLinhas.length}):`, ...sociosLinhas] : []),
  ].filter(Boolean).join('\n')

  // Indexa no canal CRM (contador) e Portal (cliente)
  await Promise.all([
    indexar(linhas, {
      escopo: 'cliente',
      canal: 'crm',
      tipo: 'dados_empresa',
      clienteId: cliente.id,
      titulo: cliente.razaoSocial ?? cliente.nome,
      documentoId: `dados_empresa_crm:${cliente.id}`,
    }, key),
    indexar(linhas, {
      escopo: 'cliente',
      canal: 'portal',
      tipo: 'dados_empresa',
      clienteId: cliente.id,
      titulo: cliente.razaoSocial ?? cliente.nome,
      documentoId: `dados_empresa_portal:${cliente.id}`,
    }, key),
    indexar(linhas, {
      escopo: 'cliente',
      canal: 'whatsapp',
      tipo: 'dados_empresa',
      clienteId: cliente.id,
      titulo: cliente.razaoSocial ?? cliente.nome,
      documentoId: `dados_empresa_whatsapp:${cliente.id}`,
    }, key),
  ])
}

// ─── Interação CRM ─────────────────────────────────────────────────────────

type InteracaoData = {
  id: string
  clienteId?: string | null
  leadId?: string | null
  tipo: string
  titulo?: string | null
  conteudo?: string | null
  criadoEm?: Date
}

// Tipos visíveis apenas no CRM (notas internas, registros de atendimento)
const TIPOS_SOMENTE_CRM = ['nota_interna', 'ligacao', 'whatsapp_enviado']
// Tipos client-facing: indexados no CRM e também no portal (entregáveis visíveis ao cliente)
const TIPOS_CRM_E_PORTAL = ['email_enviado', 'documento_enviado']

export async function indexarInteracao(interacao: InteracaoData): Promise<void> {
  if (!interacao.conteudo?.trim()) return

  const isCrm    = TIPOS_SOMENTE_CRM.includes(interacao.tipo)
  const isPortal = TIPOS_CRM_E_PORTAL.includes(interacao.tipo)
  if (!isCrm && !isPortal) return

  const key = await getVoyageKey()
  if (!key) return

  const data = interacao.criadoEm ? interacao.criadoEm.toLocaleDateString('pt-BR') : ''
  const linhas = [
    interacao.titulo ? `${interacao.titulo}` : `Interação: ${interacao.tipo}`,
    data ? `Data: ${data}` : '',
    interacao.conteudo,
  ].filter(Boolean).join('\n')

  const base = {
    escopo: interacao.clienteId ? 'cliente' : 'lead',
    tipo: 'historico_crm',
    clienteId: interacao.clienteId ?? undefined,
    leadId: interacao.leadId ?? undefined,
    titulo: interacao.titulo ?? interacao.tipo,
  } as const

  const canais: Array<'crm' | 'portal'> = isPortal ? ['crm', 'portal'] : ['crm']

  await Promise.all(canais.map(canal =>
    indexar(linhas, {
      ...base,
      canal,
      documentoId: `interacao_${canal}:${interacao.id}`,
    }, key)
  ))
}

// ─── Escritório ─────────────────────────────────────────────────────────────

type EscritorioData = {
  id: string
  nome: string
  nomeFantasia?: string | null
  cnpj?: string | null
  crc?: string | null
  email?: string | null
  telefone?: string | null
  whatsapp?: string | null
  cidade?: string | null
  uf?: string | null
  logradouro?: string | null
  bairro?: string | null
  fraseBemVindo?: string | null
  metaDescricao?: string | null
}

// Indexa os dados do escritório em canal 'geral' — disponível para todas as IAs
export async function indexarEscritorio(escritorio: EscritorioData): Promise<void> {
  const key = await getVoyageKey()
  if (!key) return

  const linhas = [
    `Escritório de contabilidade: ${escritorio.nomeFantasia ?? escritorio.nome}`,
    escritorio.cnpj      ? `CNPJ: ${escritorio.cnpj}` : '',
    escritorio.crc       ? `CRC: ${escritorio.crc}` : '',
    escritorio.email     ? `E-mail: ${escritorio.email}` : '',
    escritorio.telefone  ? `Telefone: ${escritorio.telefone}` : '',
    escritorio.whatsapp  ? `WhatsApp: ${escritorio.whatsapp}` : '',
    (escritorio.cidade || escritorio.uf)
      ? `Cidade: ${[escritorio.cidade, escritorio.uf].filter(Boolean).join(' / ')}`
      : '',
    escritorio.logradouro ? `Endereço: ${escritorio.logradouro}${escritorio.bairro ? ', ' + escritorio.bairro : ''}` : '',
    escritorio.fraseBemVindo  ? `Apresentação: ${escritorio.fraseBemVindo}` : '',
    escritorio.metaDescricao  ? `Descrição: ${escritorio.metaDescricao}` : '',
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo: 'global',
    canal: 'geral',
    tipo: 'base_conhecimento',
    documentoId: `escritorio:${escritorio.id}`,
    titulo: `Dados do escritório — ${escritorio.nomeFantasia ?? escritorio.nome}`,
  }, key)
}

// ─── Contrato ────────────────────────────────────────────────────────────────

type ContratoIndexData = {
  id: string
  leadId: string
  dados: Record<string, string> | null
  lead: { contatoEntrada: string }
  plano: string
  valor: number
  vencimento: number
  formaPagamento: string
  agora: Date
  assinatura: string
}

// Indexa contrato assinado no canal 'onboarding' (escopo lead).
// Usa documentoId fixo para garantir idempotência em re-assinaturas.
export async function indexarContrato(data: ContratoIndexData): Promise<void> {
  const key = await getVoyageKey()
  if (!key) return

  const { id, leadId, dados, lead, plano, valor, vencimento, formaPagamento, agora, assinatura } = data

  const texto = [
    `Contrato de Prestação de Serviços Contábeis`,
    `Cliente: ${dados?.['Nome completo'] ?? lead.contatoEntrada}`,
    dados?.['CPF']          ? `CPF: ${dados['CPF']}` : '',
    dados?.['E-mail']       ? `E-mail: ${dados['E-mail']}` : '',
    dados?.['Telefone']     ? `Telefone: ${dados['Telefone']}` : '',
    dados?.['CNPJ']         ? `CNPJ: ${dados['CNPJ']}` : '',
    dados?.['Razão Social'] ? `Razão Social: ${dados['Razão Social']}` : '',
    dados?.['Cidade']       ? `Cidade: ${dados['Cidade']}` : '',
    `Plano: ${plano} — R$ ${valor}/mês`,
    `Vencimento: dia ${vencimento} — ${formaPagamento}`,
    `Assinado em: ${agora.toLocaleDateString('pt-BR')}`,
    `Assinatura digital: ${assinatura}`,
  ].filter(Boolean).join('\n')

  await indexar(texto, {
    escopo: 'lead',
    canal: 'onboarding',
    tipo: 'dados_lead',
    leadId,
    titulo: `Contrato — ${dados?.['Nome completo'] ?? lead.contatoEntrada}`,
    documentoId: `contrato:${id}`,
  }, key)
}

// ─── Tarefa ──────────────────────────────────────────────────────────────────

type TarefaData = {
  id: string
  titulo: string
  descricao?: string | null
  clienteId?: string | null
  status: string
  prioridade: string
  prazo?: Date | null
  concluidaEm?: Date | null
}

// Indexa tarefas vinculadas a clientes no canal CRM.
// Tarefas sem clienteId não são indexadas (sem contexto relevante para as IAs).
export async function indexarTarefa(tarefa: TarefaData): Promise<void> {
  if (!tarefa.clienteId) return
  if (tarefa.status === 'cancelada') {
    // Remove do índice tarefas canceladas
    import('@/lib/rag').then(({ deleteEmbeddings }) =>
      deleteEmbeddings({ documentoId: `tarefa:${tarefa.id}` })
    ).catch(err => console.error('[rag/ingest] erro ao remover tarefa cancelada:', err))
    return
  }

  const key = await getVoyageKey()
  if (!key) return

  const prazoStr = tarefa.prazo ? tarefa.prazo.toLocaleDateString('pt-BR') : null
  const concluidaStr = tarefa.concluidaEm ? tarefa.concluidaEm.toLocaleDateString('pt-BR') : null

  const linhas = [
    `Tarefa: ${tarefa.titulo}`,
    `Status: ${tarefa.status}`,
    `Prioridade: ${tarefa.prioridade}`,
    prazoStr    ? `Prazo: ${prazoStr}` : '',
    concluidaStr ? `Concluída em: ${concluidaStr}` : '',
    tarefa.descricao ? `Descrição: ${tarefa.descricao}` : '',
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo: 'cliente',
    canal: 'crm',
    tipo: 'historico_crm',
    clienteId: tarefa.clienteId,
    titulo: tarefa.titulo,
    documentoId: `tarefa:${tarefa.id}`,
  }, key)
}

// ─── Escalação ───────────────────────────────────────────────────────────────

type EscalacaoData = {
  id: string
  clienteId?: string | null
  leadId?: string | null
  canal: string
  motivoIA?: string | null
  orientacaoHumana?: string | null
  respostaEnviada?: string | null
  criadoEm?: Date
}

// Indexa escalações resolvidas no canal CRM — aprende com atendimentos humanos passados.
export async function indexarEscalacao(escalacao: EscalacaoData): Promise<void> {
  if (!escalacao.clienteId && !escalacao.leadId) return
  if (!escalacao.motivoIA && !escalacao.orientacaoHumana) return

  const key = await getVoyageKey()
  if (!key) return

  const data = escalacao.criadoEm ? escalacao.criadoEm.toLocaleDateString('pt-BR') : ''

  const linhas = [
    `Escalação para atendimento humano (canal: ${escalacao.canal})`,
    data ? `Data: ${data}` : '',
    escalacao.motivoIA          ? `Motivo: ${escalacao.motivoIA}` : '',
    escalacao.orientacaoHumana  ? `Orientação da equipe: ${escalacao.orientacaoHumana}` : '',
    escalacao.respostaEnviada   ? `Resposta enviada ao cliente: ${escalacao.respostaEnviada}` : '',
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo: escalacao.clienteId ? 'cliente' : 'lead',
    canal: 'crm',
    tipo: 'historico_crm',
    clienteId: escalacao.clienteId ?? undefined,
    leadId:    escalacao.leadId    ?? undefined,
    titulo: `Escalação — ${escalacao.canal}`,
    documentoId: `escalacao:${escalacao.id}`,
  }, key)
}

// ─── Planos ──────────────────────────────────────────────────────────────────

// Indexa os planos no canal 'geral' — disponível para todas as IAs.
// Lê do banco (tabela Plano). Se vazio, usa PLANOS_INFO como fallback.
export async function indexarPlanos(): Promise<void> {
  const key = await getVoyageKey()
  if (!key) return

  // Tenta carregar do banco — usa fallback hardcoded se banco retornar vazio
  let planosParaIndexar: Array<{ nome: string; descricao?: string | null; valorMinimo: unknown; valorMaximo: unknown; servicos: unknown }>
  try {
    const { prisma } = await import('@/lib/prisma')
    const dbPlanos = await prisma.plano.findMany({ where: { ativo: true }, orderBy: { valorMinimo: 'asc' } })
    planosParaIndexar = dbPlanos.length > 0 ? dbPlanos : PLANOS_INFO.map(p => ({
      nome: p.nome,
      descricao: p.desc,
      valorMinimo: p.faixaPreco,
      valorMaximo: null,
      servicos: p.servicos,
    }))
  } catch {
    planosParaIndexar = PLANOS_INFO.map(p => ({
      nome: p.nome,
      descricao: p.desc,
      valorMinimo: p.faixaPreco,
      valorMaximo: null,
      servicos: p.servicos,
    }))
  }

  const texto = [
    'Planos de contabilidade disponíveis:',
    '',
    ...planosParaIndexar.map(p => {
      const servicos: string[] = Array.isArray(p.servicos) ? (p.servicos as string[]) : []
      const faixa = p.valorMaximo
        ? `R$ ${p.valorMinimo} – R$ ${p.valorMaximo}/mês`
        : `A partir de R$ ${p.valorMinimo}/mês`
      return [
        `## Plano ${p.nome}`,
        p.descricao ? `Descrição: ${p.descricao}` : '',
        `Preço: ${faixa}`,
        servicos.length ? `Serviços inclusos:\n${servicos.map(s => `- ${s}`).join('\n')}` : '',
      ].filter(Boolean).join('\n')
    }),
  ].join('\n\n')

  await indexar(texto, {
    escopo: 'global',
    canal: 'geral',
    tipo: 'base_conhecimento',
    documentoId: 'planos:v1',
    titulo: 'Planos e preços do escritório',
  }, key)
}
