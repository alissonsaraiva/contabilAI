// Ingestão automática de entidades relacionais no RAG
// Chamado em background após creates/updates — não bloqueia respostas

import { createHash } from 'crypto'
import { chunkText, embedTexts, storeEmbeddings, deleteEmbeddings, getContentHash } from '@/lib/rag'
import type { EmbeddingRow, CanalRAG } from '@/lib/rag'
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

type EmbedKeys = { openai: string | null; voyage: string | null }

async function getEmbeddingKeys(): Promise<EmbedKeys> {
  try {
    const cfg = await getAiConfig()
    return { openai: cfg.openaiApiKey, voyage: cfg.voyageApiKey }
  } catch {
    return {
      openai: process.env.OPENAI_API_KEY ?? null,
      voyage: process.env.VOYAGE_API_KEY ?? null,
    }
  }
}

async function indexar(
  texto: string,
  row: Omit<EmbeddingRow, 'conteudo'>,
  keys: EmbedKeys,
): Promise<void> {
  const chunks = chunkText(texto)
  if (!chunks.length) return

  // Dirty check — se documentoId conhecido, evita re-indexar conteúdo idêntico
  // (economiza chamadas de embedding quando um update não muda os campos indexados)
  const contentHash = createHash('md5').update(texto).digest('hex')
  if (row.documentoId) {
    const storedHash = await getContentHash(row.documentoId)
    if (storedHash === contentHash) return  // conteúdo não mudou — pula

    await deleteEmbeddings({ documentoId: row.documentoId })
  } else if (row.leadId && row.tipo) {
    await deleteEmbeddings({ leadId: row.leadId, tipo: row.tipo })
  } else if (row.clienteId && row.tipo) {
    await deleteEmbeddings({ clienteId: row.clienteId, tipo: row.tipo })
  }

  // Prefixo de título: injeta o título no texto embeddado para que chunks de
  // documentos longos mantenham contexto semântico mesmo sem a primeira página.
  // O conteúdo armazenado permanece limpo (sem prefixo) — só o embedding muda.
  const titulo = (row as { titulo?: string }).titulo
  const chunksParaEmbed = titulo && chunks.length > 1
    ? chunks.map(c => `[${titulo}]\n${c}`)
    : chunks

  const embeddings = await embedTexts(chunksParaEmbed, keys)
  const rows: EmbeddingRow[] = chunks.map((conteudo, i) => ({
    ...row,
    conteudo,
    metadata: { chunkIndex: i, totalChunks: chunks.length, contentHash },
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
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
}

export async function indexarLead(lead: LeadData): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const dados = (lead.dadosJson ?? {}) as Record<string, unknown>

  // Campos conhecidos extraídos com labels legíveis
  const camposConhecidos = new Set([
    'Nome completo', 'CPF', 'E-mail', 'Telefone', 'CNPJ', 'Razão Social',
    'Nome Fantasia', 'Regime', 'Cidade', 'Endereço de Faturamento',
    'Atividade Principal', 'email', 'nome', 'cpf', 'cnpj', 'telefone',
    // Objetos aninhados — excluir do camposDinamicos para evitar [object Object]
    'simulador',
  ])

  // Extrai TODOS os campos dinâmicos do dadosJson (não só os conhecidos)
  // Isso garante que campos customizados do formulário (dúvidas, observações,
  // informações extras) também sejam indexados e acessíveis à IA.
  const camposDinamicos = Object.entries(dados)
    .filter(([chave, valor]) =>
      !camposConhecidos.has(chave) &&
      valor != null &&
      typeof valor !== 'object' &&          // exclui objetos/arrays aninhados
      String(valor).trim().length > 0 &&
      String(valor).trim() !== 'null' &&
      String(valor).trim() !== 'undefined'
    )
    .map(([chave, valor]) => `${chave}: ${String(valor).trim()}`)

  const linhas = [
    `Lead de onboarding`,
    `Contato: ${lead.contatoEntrada}`,
    lead.canal     ? `Canal de entrada: ${lead.canal}` : '',
    lead.status    ? `Status: ${lead.status}` : '',
    lead.planoTipo ? `Plano de interesse: ${lead.planoTipo}` : '',
    dados['Nome completo']  ? `Nome: ${dados['Nome completo']}` : '',
    dados['nome']           ? `Nome: ${dados['nome']}` : '',
    dados['CPF']            ? `CPF: ${dados['CPF']}` : '',
    dados['cpf']            ? `CPF: ${dados['cpf']}` : '',
    dados['E-mail']         ? `E-mail: ${dados['E-mail']}` : '',
    dados['email']          ? `E-mail: ${dados['email']}` : '',
    dados['Telefone']       ? `Telefone: ${dados['Telefone']}` : '',
    dados['telefone']       ? `Telefone: ${dados['telefone']}` : '',
    dados['CNPJ']           ? `CNPJ: ${dados['CNPJ']}` : '',
    dados['cnpj']           ? `CNPJ: ${dados['cnpj']}` : '',
    dados['Razão Social']   ? `Razão Social: ${dados['Razão Social']}` : '',
    dados['Nome Fantasia']  ? `Nome Fantasia: ${dados['Nome Fantasia']}` : '',
    dados['Cidade']         ? `Cidade: ${dados['Cidade']}` : '',
    dados['Endereço de Faturamento'] ? `Endereço: ${dados['Endereço de Faturamento']}` : '',
    dados['Regime']                  ? `Regime: ${dados['Regime']}` : '',
    dados['Atividade Principal']     ? `Atividade: ${dados['Atividade Principal']}` : '',
    // Campos dinâmicos adicionais (customizações do formulário de onboarding)
    ...camposDinamicos,
    // UTM — origem de marketing para diagnóstico de funil
    lead.utmSource   ? `UTM Source: ${lead.utmSource}` : '',
    lead.utmMedium   ? `UTM Medium: ${lead.utmMedium}` : '',
    lead.utmCampaign ? `UTM Campaign: ${lead.utmCampaign}` : '',
  ].filter(Boolean).join('\n')

  const nomeDisplay = String(dados['Nome completo'] ?? dados['nome'] ?? lead.contatoEntrada)

  await indexar(linhas, {
    escopo: 'lead',
    canal: 'onboarding',
    tipo: 'dados_lead',
    leadId: lead.id,
    titulo: nomeDisplay,
  }, keys)
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

type ContratoClienteData = {
  planoTipo: string
  valorMensal: unknown
  vencimentoDia: number
  formaPagamento: string
  assinadoEm?: Date | null
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
  contrato?: ContratoClienteData | null
}

export async function indexarCliente(cliente: ClienteData): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const sociosLinhas = (cliente.socios ?? []).map(s => [
    `  - ${s.nome} (CPF: ${s.cpf})${s.principal ? ' — sócio principal' : ''}`,
    s.qualificacao   ? `    Qualificação: ${s.qualificacao}` : '',
    s.participacao != null ? `    Participação: ${s.participacao}%` : '',
    s.email          ? `    E-mail: ${s.email}` : '',
    s.telefone       ? `    Telefone: ${s.telefone}` : '',
  ].filter(Boolean).join('\n'))

  const contratoLinhas = cliente.contrato ? [
    `Contrato vigente:`,
    `  Plano: ${cliente.contrato.planoTipo}`,
    `  Valor mensal: R$ ${cliente.contrato.valorMensal}`,
    `  Vencimento: dia ${cliente.contrato.vencimentoDia}`,
    `  Forma de pagamento: ${cliente.contrato.formaPagamento}`,
    cliente.contrato.assinadoEm
      ? `  Assinado em: ${cliente.contrato.assinadoEm.toLocaleDateString('pt-BR')}`
      : '',
  ].filter(Boolean) : []

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
    ...(contratoLinhas.length ? [contratoLinhas.join('\n')] : []),
  ].filter(Boolean).join('\n')

  // Uma única entrada 'geral' substitui as 3 entradas separadas (crm/portal/whatsapp).
  // canal 'geral' é incluído automaticamente em buscas de qualquer canal.
  // Reduz 3× chamadas de embedding por atualização de cliente.
  // Nota: entradas legadas (dados_empresa_crm/portal/whatsapp:{id}) ficam inativas no banco
  // — sem impacto funcional, pois o dirty check não as toca. Limpeza opcional:
  //   DELETE FROM vectors.embeddings WHERE documento_id ~ '^dados_empresa_(crm|portal|whatsapp):'
  await indexar(linhas, {
    escopo:      'cliente',
    canal:       'geral',
    tipo:        'dados_empresa',
    clienteId:   cliente.id,
    titulo:      cliente.razaoSocial ?? cliente.nome,
    documentoId: `dados_empresa:${cliente.id}`,
  }, keys)
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
const TIPOS_SOMENTE_CRM = ['nota_interna', 'ligacao', 'whatsapp_enviado', 'documento_recebido_whatsapp']
// Tipos client-facing: indexados no CRM e também no portal (entregáveis visíveis ao cliente)
// email_recebido: cliente enviou → CRM precisa saber "o que o João nos enviou?", portal AI precisa de contexto
const TIPOS_CRM_E_PORTAL = ['email_enviado', 'email_recebido', 'documento_enviado']

export async function indexarInteracao(interacao: InteracaoData): Promise<void> {
  if (!interacao.conteudo?.trim()) return

  const isCrm    = TIPOS_SOMENTE_CRM.includes(interacao.tipo)
  const isPortal = TIPOS_CRM_E_PORTAL.includes(interacao.tipo)
  if (!isCrm && !isPortal) return

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

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

  // isPortal → canal 'geral' (visível a crm + portal com uma única entrada)
  // isCrm   → canal 'crm' (somente interno)
  const canal = isPortal ? 'geral' : 'crm'

  await indexar(linhas, {
    ...base,
    canal,
    documentoId: `interacao:${interacao.id}`,
  }, keys)
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
  // Termos contratuais — usados pela IA ao explicar multa, juros, desconto Pix
  multaPercent?: number | null
  jurosMesPercent?: number | null
  diasAtrasoMulta?: number | null
  pixDescontoPercent?: number | null
}

// Indexa os dados do escritório em canal 'geral' — disponível para todas as IAs
export async function indexarEscritorio(escritorio: EscritorioData): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

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
    // Termos contratuais — informados pela IA quando clientes perguntam sobre encargos
    escritorio.multaPercent      != null ? `Multa por atraso: ${escritorio.multaPercent}%` : '',
    escritorio.jurosMesPercent   != null ? `Juros mensais: ${escritorio.jurosMesPercent}%` : '',
    escritorio.diasAtrasoMulta   != null ? `Multa aplicada após: ${escritorio.diasAtrasoMulta} dias de atraso` : '',
    escritorio.pixDescontoPercent != null ? `Desconto para pagamento via Pix: ${escritorio.pixDescontoPercent}%` : '',
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo: 'global',
    canal: 'geral',
    tipo: 'base_conhecimento',
    documentoId: `escritorio:${escritorio.id}`,
    titulo: `Dados do escritório — ${escritorio.nomeFantasia ?? escritorio.nome}`,
  }, keys)
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
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

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
  }, keys)
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

// Indexa escalações resolvidas no CRM sempre; também indexa no canal de origem
// (portal ou whatsapp) para que a IA daquele canal conheça o histórico de atendimento.
export async function indexarEscalacao(escalacao: EscalacaoData): Promise<void> {
  if (!escalacao.clienteId && !escalacao.leadId) return
  if (!escalacao.motivoIA && !escalacao.orientacaoHumana) return

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = escalacao.criadoEm ? escalacao.criadoEm.toLocaleDateString('pt-BR') : ''

  const linhas = [
    `Escalação para atendimento humano (canal: ${escalacao.canal})`,
    data ? `Data: ${data}` : '',
    escalacao.motivoIA          ? `Motivo: ${escalacao.motivoIA}` : '',
    escalacao.orientacaoHumana  ? `Orientação da equipe: ${escalacao.orientacaoHumana}` : '',
    escalacao.respostaEnviada   ? `Resposta enviada ao cliente: ${escalacao.respostaEnviada}` : '',
  ].filter(Boolean).join('\n')

  const base = {
    escopo:    (escalacao.clienteId ? 'cliente' : 'lead') as 'cliente' | 'lead',
    tipo:      'historico_crm' as const,
    clienteId: escalacao.clienteId ?? undefined,
    leadId:    escalacao.leadId    ?? undefined,
    titulo:    `Escalação — ${escalacao.canal}`,
  }

  // Escalações de portal/whatsapp: canal 'geral' cobre o CRM e o canal de origem com 1 entrada.
  // Escalações de outros canais (crm direto): canal 'crm' apenas.
  const canalEscalacao = (escalacao.canal === 'portal' || escalacao.canal === 'whatsapp')
    ? 'geral'
    : 'crm'
  await indexar(linhas, { ...base, canal: canalEscalacao, documentoId: `escalacao:${escalacao.id}` }, keys)
}

// ─── Planos ──────────────────────────────────────────────────────────────────

// Indexa os planos no canal 'geral' — disponível para todas as IAs.
// Lê do banco (tabela Plano). Se vazio, usa PLANOS_INFO como fallback.
export async function indexarPlanos(): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

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
  }, keys)
}

// ─── Documento ───────────────────────────────────────────────────────────────

type DocumentoData = {
  id: string
  clienteId?: string | null
  empresaId?: string | null
  leadId?: string | null
  tipo: string
  nome: string
  categoria?: string | null
  origem: string
  criadoEm?: Date
  resumo?: string | null
}

// Indexa metadados de documento no canal CRM (e portal quando origem='portal').
// Cobre clienteId, leadId e empresaId — documentos com apenas empresaId são
// indexados usando o escopo 'cliente' com clienteId nulo (escopo global da empresa).
export async function indexarDocumento(doc: DocumentoData): Promise<void> {
  // Precisa de ao menos um vínculo para indexar
  if (!doc.clienteId && !doc.leadId && !doc.empresaId) return

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = doc.criadoEm ? doc.criadoEm.toLocaleDateString('pt-BR') : ''

  const linhas = [
    `Documento: ${doc.nome}`,
    `Tipo: ${doc.tipo}`,
    doc.categoria ? `Categoria: ${doc.categoria}` : '',
    doc.resumo    ? `Resumo: ${doc.resumo}` : '',
    `Origem: ${doc.origem}`,
    data          ? `Enviado em: ${data}` : '',
  ].filter(Boolean).join('\n')

  // canal 'geral' para documentos crm/portal (Clara e CRM vêem com 1 entrada)
  // canal 'crm' para origens internas (cliente nunca veria de qualquer forma)
  const canalDoc = (doc.origem === 'portal' || doc.origem === 'crm') ? 'geral' : 'crm'

  await indexar(linhas, {
    escopo:      (doc.clienteId || doc.empresaId) ? 'cliente' as const : 'lead' as const,
    tipo:        'historico_crm' as const,
    clienteId:   doc.clienteId ?? undefined,
    leadId:      doc.leadId    ?? undefined,
    titulo:      `Documento — ${doc.nome}`,
    documentoId: `documento:${doc.id}`,
    canal:       canalDoc,
  }, keys)
}

// ─── Ordem de Serviço ─────────────────────────────────────────────────────────

type OrdemServicoData = {
  id: string
  clienteId: string
  tipo: string
  titulo: string
  descricao: string
  status: string
  origem: string
  prioridade?: string | null
  visivelPortal?: boolean
  resposta?: string | null        // resolução do chamado pelo escritório
  respondidoEm?: Date | null
  avaliacaoNota?: number | null
  avaliacaoComent?: string | null
  criadoEm?: Date
}

// Indexa OS no canal CRM para que o assistente conheça os chamados abertos.
// Se visivelPortal=true, indexa também no canal portal (cliente pode perguntar).
// Inclui campo `resposta` para que o histórico de resolução fique acessível via RAG.
export async function indexarOrdemServico(os: OrdemServicoData): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = os.criadoEm ? os.criadoEm.toLocaleDateString('pt-BR') : ''
  const respondidoStr = os.respondidoEm ? os.respondidoEm.toLocaleDateString('pt-BR') : ''

  const linhas = [
    `Chamado: ${os.titulo}`,
    `Tipo: ${os.tipo}`,
    `Status: ${os.status}`,
    `Prioridade: ${os.prioridade ?? 'media'}`,
    `Origem: ${os.origem}`,
    data            ? `Aberto em: ${data}` : '',
    `Descrição: ${os.descricao}`,
    // Resolução — indexada para que a IA conheça como o chamado foi resolvido
    os.resposta     ? `\nResposta do escritório: ${os.resposta}` : '',
    respondidoStr   ? `Respondido em: ${respondidoStr}` : '',
    // Avaliação do cliente — contexto de satisfação
    os.avaliacaoNota    ? `Avaliação do cliente: ${os.avaliacaoNota}/5` : '',
    os.avaliacaoComent  ? `Comentário do cliente: ${os.avaliacaoComent}` : '',
  ].filter(Boolean).join('\n')

  const base = {
    escopo:      'cliente' as const,
    tipo:        'historico_crm' as const,
    clienteId:   os.clienteId,
    titulo:      `Chamado — ${os.titulo}`,
    documentoId: `os:${os.id}`,
  }

  // OS visível no portal → canal 'geral' (1 entrada cobre CRM + portal)
  // OS interna         → canal 'crm' apenas
  const canalOs = os.visivelPortal ? 'geral' : 'crm'
  await indexar(linhas, { ...base, canal: canalOs }, keys)
}

// ─── Comunicado ───────────────────────────────────────────────────────────────

type ComunicadoData = {
  id: string
  titulo: string
  conteudo: string
  tipo: string
  publicado: boolean
  publicadoEm?: Date | null
  expiradoEm?: Date | null
  anexoNome?: string | null
}

// Indexa comunicados publicados no canal 'geral' — visível para todas as IAs.
// Comunicados não publicados são removidos do índice.
export async function indexarComunicado(comunicado: ComunicadoData): Promise<void> {
  const documentoId = `comunicado:${comunicado.id}`

  if (!comunicado.publicado) {
    // Remove do índice se despublicado ou deletado
    import('@/lib/rag').then(({ deleteEmbeddings }) =>
      deleteEmbeddings({ documentoId })
    ).catch(err => console.error('[rag/ingest] erro ao remover comunicado:', err))
    return
  }

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const publicadoStr   = comunicado.publicadoEm ? comunicado.publicadoEm.toLocaleDateString('pt-BR') : ''
  const expiracao      = comunicado.expiradoEm  ? comunicado.expiradoEm.toLocaleDateString('pt-BR')  : ''

  const linhas = [
    `Comunicado: ${comunicado.titulo}`,
    `Tipo: ${comunicado.tipo}`,
    publicadoStr ? `Publicado em: ${publicadoStr}` : '',
    expiracao    ? `Válido até: ${expiracao}` : '',
    comunicado.anexoNome ? `Anexo disponível: ${comunicado.anexoNome}` : '',
    ``,
    comunicado.conteudo,
  ].filter(v => v !== undefined && v !== null && v !== '').join('\n')

  await indexar(linhas, {
    escopo:      'global',
    canal:       'geral',
    tipo:        'base_conhecimento',
    documentoId,
    titulo:      `Comunicado — ${comunicado.titulo}`,
  }, keys)
}

// ─── Relatório do Agente ──────────────────────────────────────────────────────

type RelatorioAgenteData = {
  id: string
  titulo: string
  conteudo: string
  tipo: string          // 'agendado' | 'manual'
  sucesso: boolean
  agendamentoDesc?: string | null
  criadoPorNome?: string | null
  criadoEm?: Date
}

// Indexa relatórios gerados pela IA no canal CRM.
// Permite que o assistente responda "o que o relatório da semana passada dizia?" via RAG.
// Relatórios com sucesso=false (erros) não são indexados — conteúdo pode ser incompleto.
export async function indexarRelatorio(rel: RelatorioAgenteData): Promise<void> {
  if (!rel.sucesso) return   // não indexa execuções com erro

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = rel.criadoEm ? rel.criadoEm.toLocaleDateString('pt-BR') : ''

  // Extrai texto plano do conteúdo (JSON estruturado ou texto livre)
  let conteudoTexto = rel.conteudo
  try {
    const { relatorioJSONParaTexto, parseRelatorioJSON } = await import('@/lib/relatorio-schema')
    const parsed = parseRelatorioJSON(rel.conteudo)
    if (parsed) conteudoTexto = relatorioJSONParaTexto(parsed)
  } catch {
    // fallback para texto bruto
  }

  const linhas = [
    `Relatório gerado pela IA: ${rel.titulo}`,
    `Tipo: ${rel.tipo === 'agendado' ? 'Agendamento automático' : 'Manual'}`,
    rel.agendamentoDesc ? `Agendamento: ${rel.agendamentoDesc}` : '',
    rel.criadoPorNome   ? `Solicitado por: ${rel.criadoPorNome}` : '',
    data                ? `Gerado em: ${data}` : '',
    ``,
    conteudoTexto,
  ].filter(v => v !== null && v !== undefined).join('\n')

  await indexar(linhas, {
    escopo:      'global',
    canal:       'crm',
    tipo:        'historico_crm',
    documentoId: `relatorio:${rel.id}`,
    titulo:      `Relatório — ${rel.titulo}`,
  }, keys)
}

// ─── Histórico de Status do Cliente ──────────────────────────────────────────

type StatusHistoricoData = {
  id: string
  clienteId: string
  statusAntes: string
  statusDepois: string
  motivo?: string | null
  operadorNome?: string | null
  criadoEm?: Date
}

// Indexa transições de status no CRM e no portal — contexto essencial para
// que a IA saiba por que um cliente está suspenso, cancelado ou reativado.
export async function indexarStatusHistorico(historico: StatusHistoricoData): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = historico.criadoEm ? historico.criadoEm.toLocaleDateString('pt-BR') : ''

  const linhas = [
    `Alteração de status do cliente`,
    `De: ${historico.statusAntes} → Para: ${historico.statusDepois}`,
    data                    ? `Data: ${data}` : '',
    historico.motivo        ? `Motivo: ${historico.motivo}` : '',
    historico.operadorNome  ? `Operador: ${historico.operadorNome}` : '',
  ].filter(Boolean).join('\n')

  const base = {
    escopo:    'cliente' as const,
    tipo:      'historico_crm' as const,
    clienteId: historico.clienteId,
    titulo:    `Status ${historico.statusAntes} → ${historico.statusDepois}`,
    documentoId: `status_historico:${historico.id}`,
  }

  // canal 'geral' — visível ao CRM e ao portal com uma única entrada de embedding
  await indexar(linhas, { ...base, canal: 'geral' }, keys)
}

// ─── Empresa ──────────────────────────────────────────────────────────────────

type EmpresaData = {
  id: string
  cnpj?: string | null
  razaoSocial?: string | null
  nomeFantasia?: string | null
  regime?: string | null
  status?: string | null
  socios?: SocioData[]
}

// Indexa dados da empresa independentemente do cliente — útil para buscas por
// CNPJ, razão social ou regime diretamente no CRM e portal.
export async function indexarEmpresa(empresa: EmpresaData): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const sociosLinhas = (empresa.socios ?? []).map(s => [
    `  - ${s.nome} (CPF: ${s.cpf})${s.principal ? ' — sócio principal' : ''}`,
    s.qualificacao   ? `    Qualificação: ${s.qualificacao}` : '',
    s.participacao != null ? `    Participação: ${s.participacao}%` : '',
    s.email          ? `    E-mail: ${s.email}` : '',
    s.telefone       ? `    Telefone: ${s.telefone}` : '',
  ].filter(Boolean).join('\n'))

  const linhas = [
    `Empresa`,
    empresa.razaoSocial  ? `Razão Social: ${empresa.razaoSocial}` : '',
    empresa.nomeFantasia ? `Nome Fantasia: ${empresa.nomeFantasia}` : '',
    empresa.cnpj         ? `CNPJ: ${empresa.cnpj}` : '',
    empresa.regime       ? `Regime tributário: ${empresa.regime}` : '',
    empresa.status       ? `Status: ${empresa.status}` : '',
    ...(sociosLinhas.length ? [`Sócios (${sociosLinhas.length}):`, ...sociosLinhas] : []),
  ].filter(Boolean).join('\n')

  const base = {
    escopo:      'global' as const,
    tipo:        'base_conhecimento' as const,
    titulo:      empresa.razaoSocial ?? empresa.nomeFantasia ?? `Empresa ${empresa.id}`,
    documentoId: `empresa:${empresa.id}`,
  }

  // canal 'geral' — visível ao CRM e ao portal com uma única entrada
  await indexar(linhas, { ...base, canal: 'geral' }, keys)
}

// ─── Conversa IA ──────────────────────────────────────────────────────────────

type MensagemConversaData = {
  role:      string
  conteudo:  string
  criadaEm?: Date
}

type ConversaData = {
  id:        string
  canal:     string
  clienteId?: string | null
  leadId?:    string | null
  mensagens:  MensagemConversaData[]
  pausadaEm?: Date | null
}

// Indexa o histórico de respostas da IA ao pausar uma conversa (humano assume).
// Indexa apenas mensagens do assistente com conteúdo substantivo (>80 chars) —
// filtra "ok", "tá bom" e confirmações vazias que não agregam contexto semântico.
// Permite que futuras perguntas como "o que o cliente X perguntou semana passada?"
// sejam respondidas via RAG sem recorrer ao DB.
export async function indexarConversa(conversa: ConversaData): Promise<void> {
  const substantivas = conversa.mensagens
    .filter(m => m.role === 'assistant' && m.conteudo.trim().length > 80)
    .slice(-8)  // últimas 8 respostas substantivas — contexto suficiente sem excesso

  if (substantivas.length === 0) return

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = conversa.pausadaEm
    ? conversa.pausadaEm.toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')

  const linhas = [
    `Histórico de conversa — canal: ${conversa.canal}`,
    `Data: ${data}`,
    '',
    ...substantivas.map((m, i) =>
      `[Resposta ${i + 1}]\n${m.conteudo.slice(0, 600)}`
    ),
  ].join('\n\n')

  const escopo = conversa.clienteId ? 'cliente' : conversa.leadId ? 'lead' : 'global'
  const canal  = (['crm', 'portal', 'whatsapp', 'onboarding'].includes(conversa.canal)
    ? conversa.canal
    : 'geral') as CanalRAG

  await indexar(linhas, {
    escopo,
    canal,
    tipo:        'historico_crm',
    clienteId:   conversa.clienteId ?? undefined,
    leadId:      conversa.leadId    ?? undefined,
    titulo:      `Conversa ${conversa.canal} — ${data}`,
    documentoId: `conversa:${conversa.id}`,
  }, keys)
}

// ─── Ação do Agente (AgenteAcao) ──────────────────────────────────────────────

type AgenteAcaoData = {
  id: string
  clienteId?: string | null
  leadId?: string | null
  tool: string
  solicitanteAI: string
  usuarioNome?: string | null
  input: unknown
  resultado: { sucesso?: boolean; resumo?: string; erro?: string; dados?: unknown }
  sucesso: boolean
  duracaoMs: number
  criadoEm?: Date
}

// Indexa ações executadas pelo agente operacional no tipo 'historico_agente'.
// Permite que a IA responda "o que foi feito para o cliente X?" via RAG sem
// recorrer ao banco, e aprenda padrões de sucesso/falha por tool ao longo do tempo.
// Indexa ações bem-sucedidas e falhas (com prefixo [FALHA]) para aprendizado de padrões.
export async function indexarAgenteAcao(acao: AgenteAcaoData): Promise<void> {
  if (!acao.clienteId && !acao.leadId) return  // sem contexto de entidade

  const resumo = acao.resultado?.resumo?.trim()
  const erro   = acao.resultado?.erro?.trim()

  // Falhas: indexa com prefixo [FALHA] para permitir diagnóstico de padrões recorrentes
  if (!acao.sucesso) {
    if (!erro || erro.length < 5) return
    const resumoFalha = `[FALHA] ${acao.tool}: ${erro}`
    const keys = await getEmbeddingKeys()
    if (!keys.openai && !keys.voyage) return
    const data = acao.criadoEm ? acao.criadoEm.toLocaleDateString('pt-BR') : ''
    const linhasErr = [
      resumoFalha,
      `Canal: ${acao.solicitanteAI}`,
      data ? `Data: ${data}` : '',
    ].filter(Boolean).join('\n')
    await indexar(linhasErr, {
      escopo:    acao.clienteId ? 'cliente' : 'lead',
      canal:     'crm',
      tipo:      'historico_crm' as const,
      clienteId: acao.clienteId ?? undefined,
      leadId:    acao.leadId    ?? undefined,
      titulo:    `[FALHA] ${acao.tool}`,
    }, keys)
    return
  }

  if (!resumo || resumo.length < 5) return  // sem resumo útil

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const data = acao.criadoEm ? acao.criadoEm.toLocaleDateString('pt-BR') : ''
  const hora = acao.criadoEm
    ? acao.criadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : ''

  // Serializa o input de forma legível (omite campos sensíveis longos)
  let inputResumido = ''
  try {
    const inp = acao.input as Record<string, unknown>
    inputResumido = Object.entries(inp)
      .filter(([, v]) => v != null && String(v).length < 200)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ')
  } catch { /* ignora */ }

  const linhas = [
    `Ação do agente: ${acao.tool}`,
    `Canal: ${acao.solicitanteAI}`,
    data ? `Data: ${data}${hora ? ' às ' + hora : ''}` : '',
    acao.usuarioNome ? `Solicitado por: ${acao.usuarioNome}` : '',
    inputResumido    ? `Parâmetros: ${inputResumido}` : '',
    `Resultado: ${resumo}`,
    `Duração: ${acao.duracaoMs}ms`,
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo:      acao.clienteId ? 'cliente' : 'lead',
    canal:       'crm',
    tipo:        'historico_agente',
    clienteId:   acao.clienteId ?? undefined,
    leadId:      acao.leadId    ?? undefined,
    titulo:      `Ação ${acao.tool} — ${data}`,
    documentoId: `agente_acao:${acao.id}`,
  }, keys)
}

// ─── Agendamento do Agente ─────────────────────────────────────────────────────

type AgendamentoData = {
  id: string
  descricao: string
  cron: string
  instrucao: string
  ativo: boolean
  criadoPorNome?: string | null
  ultimoDisparo?: Date | null
  proximoDisparo?: Date | null
}

// Indexa agendamentos ativos no canal CRM (escopo global do escritório).
// Permite que a IA responda "o que está agendado?" sem precisar chamar a tool
// listarAgendamentos em consultas simples — economiza tokens e latência.
// Agendamentos inativos são removidos do índice.
export async function indexarAgendamento(ag: AgendamentoData): Promise<void> {
  const documentoId = `agendamento:${ag.id}`

  if (!ag.ativo) {
    import('@/lib/rag').then(({ deleteEmbeddings }) =>
      deleteEmbeddings({ documentoId })
    ).catch((err: unknown) => {
      console.warn('[ingest] falha ao deletar embeddings de agendamento inativo:', { documentoId, err })
    })
    return
  }

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const ultimoStr   = ag.ultimoDisparo   ? ag.ultimoDisparo.toLocaleDateString('pt-BR')   : 'nunca'
  const proximoStr  = ag.proximoDisparo  ? ag.proximoDisparo.toLocaleDateString('pt-BR')  : 'não calculado'

  const linhas = [
    `Agendamento ativo do agente`,
    `Descrição: ${ag.descricao}`,
    `Instrução: ${ag.instrucao}`,
    `Cron: ${ag.cron}`,
    `Criado por: ${ag.criadoPorNome ?? 'sistema'}`,
    `Último disparo: ${ultimoStr}`,
    `Próximo disparo: ${proximoStr}`,
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo:      'global',
    canal:       'crm',
    tipo:        'base_conhecimento',
    documentoId,
    titulo:      `Agendamento — ${ag.descricao}`,
  }, keys)
}
