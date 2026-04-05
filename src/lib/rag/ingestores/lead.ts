import { indexar, getEmbeddingKeys } from './_core'

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
    // Objetos aninhados — indexados separadamente abaixo
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

  // Extrai dados do simulador (objeto aninhado) — regime, faturamento estimado,
  // alíquota simulada etc. Essencial para personalizar o atendimento de onboarding.
  const simulador = dados['simulador'] as Record<string, unknown> | undefined
  const simuladorLinhas = simulador
    ? Object.entries(simulador)
        .filter(([, v]) => v != null && typeof v !== 'object' && String(v).trim().length > 0)
        .map(([k, v]) => `  ${k}: ${String(v).trim()}`)
    : []

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
    // Simulador de tributação — regime e alíquota calculados pelo prospect
    ...(simuladorLinhas.length ? [`Simulador preenchido pelo prospect:\n${simuladorLinhas.join('\n')}`] : []),
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

// ─── Migração lead→cliente (conversão pós-assinatura) ────────────────────────
//
// Chamada APÓS a criação do cliente para migrar o histórico de onboarding
// para o escopo do cliente — tornando-o visível no CRM e no portal.
// Sem isso, todo o contexto preenchido no onboarding some para a IA após conversão.

type LeadMigracaoData = {
  id: string
  contatoEntrada: string
  canal?: string | null
  planoTipo?: string | null
  dadosJson?: unknown
  // Dados do contrato assinado (opcionais — enriquece o contexto)
  contratoPlano?: string | null
  contratoValor?: number | null
  contratoVencimento?: number | null
  contratoFormaPagamento?: string | null
  contratoAssinadoEm?: Date | null
}

export async function migrarLeadParaCliente(
  lead: LeadMigracaoData,
  clienteId: string,
): Promise<void> {
  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const dados = (lead.dadosJson ?? {}) as Record<string, unknown>

  // Inclui dados do simulador na migração — estava excluído no indexarLead original
  const simulador = dados['simulador'] as Record<string, unknown> | undefined
  const simuladorLinhas = simulador
    ? Object.entries(simulador)
        .filter(([, v]) => v != null && typeof v !== 'object' && String(v).trim().length > 0)
        .map(([k, v]) => `  ${k}: ${String(v).trim()}`)
    : []

  const linhas = [
    `Histórico de onboarding (lead convertido em cliente)`,
    `Contato original: ${lead.contatoEntrada}`,
    lead.canal     ? `Canal de entrada: ${lead.canal}` : '',
    lead.planoTipo ? `Plano de interesse original: ${lead.planoTipo}` : '',
    dados['Nome completo']  ? `Nome: ${dados['Nome completo']}` : '',
    dados['nome']           ? `Nome: ${dados['nome']}` : '',
    dados['CPF']            ? `CPF: ${dados['CPF']}` : '',
    dados['E-mail']         ? `E-mail: ${dados['E-mail']}` : '',
    dados['Telefone']       ? `Telefone: ${dados['Telefone']}` : '',
    dados['CNPJ']           ? `CNPJ: ${dados['CNPJ']}` : '',
    dados['Razão Social']   ? `Razão Social: ${dados['Razão Social']}` : '',
    dados['Nome Fantasia']  ? `Nome Fantasia: ${dados['Nome Fantasia']}` : '',
    dados['Cidade']         ? `Cidade: ${dados['Cidade']}` : '',
    dados['Regime']         ? `Regime: ${dados['Regime']}` : '',
    dados['Atividade Principal'] ? `Atividade: ${dados['Atividade Principal']}` : '',
    simuladorLinhas.length ? `Dados do simulador:\n${simuladorLinhas.join('\n')}` : '',
    lead.contratoPlano
      ? [
          `Contrato assinado:`,
          `  Plano: ${lead.contratoPlano}`,
          lead.contratoValor != null        ? `  Valor: R$ ${lead.contratoValor}/mês` : '',
          lead.contratoVencimento != null   ? `  Vencimento: dia ${lead.contratoVencimento}` : '',
          lead.contratoFormaPagamento       ? `  Forma de pagamento: ${lead.contratoFormaPagamento}` : '',
          lead.contratoAssinadoEm           ? `  Assinado em: ${lead.contratoAssinadoEm.toLocaleDateString('pt-BR')}` : '',
        ].filter(Boolean).join('\n')
      : '',
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo:      'cliente',
    canal:       'geral',       // visível no CRM e no portal
    tipo:        'historico_crm',
    clienteId,
    titulo:      String(dados['Nome completo'] ?? dados['nome'] ?? lead.contatoEntrada),
    documentoId: `lead_migrado:${lead.id}`,
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
