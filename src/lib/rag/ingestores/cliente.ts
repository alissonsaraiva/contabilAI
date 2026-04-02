import { indexar, getEmbeddingKeys } from './_core'

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

  // canal 'geral' — visível ao CRM e ao portal com uma única entrada de embedding
  await indexar(linhas, {
    escopo:      'cliente',
    canal:       'geral',
    tipo:        'historico_crm',
    clienteId:   historico.clienteId,
    titulo:      `Status ${historico.statusAntes} → ${historico.statusDepois}`,
    documentoId: `status_historico:${historico.id}`,
  }, keys)
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

  // canal 'geral' — visível ao CRM e ao portal com uma única entrada
  await indexar(linhas, {
    escopo:      'global',
    canal:       'geral',
    tipo:        'base_conhecimento',
    titulo:      empresa.razaoSocial ?? empresa.nomeFantasia ?? `Empresa ${empresa.id}`,
    documentoId: `empresa:${empresa.id}`,
  }, keys)
}
