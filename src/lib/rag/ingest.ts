// Ingestão automática de entidades relacionais no RAG
// Chamado em background após creates/updates — não bloqueia respostas

import { chunkText, embedTexts, storeEmbeddings, deleteEmbeddings } from '@/lib/rag'
import type { EmbeddingRow } from '@/lib/rag'
import { getAiConfig } from '@/lib/ai/config'

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
}

export async function indexarCliente(cliente: ClienteData): Promise<void> {
  const key = await getVoyageKey()
  if (!key) return

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

export async function indexarInteracao(interacao: InteracaoData): Promise<void> {
  if (!interacao.conteudo?.trim()) return
  // Só tipos relevantes para o RAG
  const tiposIndexaveis = ['nota_interna', 'whatsapp_enviado', 'email_enviado', 'ligacao']
  if (!tiposIndexaveis.includes(interacao.tipo)) return

  const key = await getVoyageKey()
  if (!key) return

  const data = interacao.criadoEm ? interacao.criadoEm.toLocaleDateString('pt-BR') : ''
  const linhas = [
    interacao.titulo ? `${interacao.titulo}` : `Interação: ${interacao.tipo}`,
    data ? `Data: ${data}` : '',
    interacao.conteudo,
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo: interacao.clienteId ? 'cliente' : 'lead',
    canal: 'crm',
    tipo: 'historico_crm',
    clienteId: interacao.clienteId ?? undefined,
    leadId: interacao.leadId ?? undefined,
    documentoId: `interacao:${interacao.id}`,
    titulo: interacao.titulo ?? interacao.tipo,
  }, key)
}
