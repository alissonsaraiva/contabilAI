import { indexar, getEmbeddingKeys } from './_core'

// ─── Email Classificado ───────────────────────────────────────────────────────
//
// Indexa emails recebidos com sua classificação (urgência + tipo) incorporada
// ao texto, permitindo que o agente CRM busque "emails urgentes do cliente X"
// ou "reclamações do cliente Y nos últimos 30 dias".
//
// Chamado APÓS classificarEmail persistir a classificação nos metadados.

type EmailClassificadoData = {
  id: string
  clienteId?: string | null
  leadId?: string | null
  titulo?: string | null    // assunto do email
  conteudo?: string | null  // corpo do email
  criadoEm?: Date
  metadados?: Record<string, unknown> | null
}

const URGENCIA_PT: Record<string, string> = {
  alta:  'ALTA ⚠️',
  media: 'MÉDIA',
  baixa: 'BAIXA',
}

const TIPO_PT: Record<string, string> = {
  solicitacao: 'Solicitação',
  duvida:      'Dúvida',
  reclamacao:  'Reclamação',
  informativo: 'Informativo',
}

export async function indexarEmailClassificado(email: EmailClassificadoData): Promise<void> {
  if (!email.conteudo?.trim()) return
  if (!email.clienteId && !email.leadId) return

  const keys = await getEmbeddingKeys()
  if (!keys.openai && !keys.voyage) return

  const metadados    = email.metadados ?? {}
  const classificacao = (metadados.classificacao ?? {}) as Record<string, unknown>
  const urgencia      = String(classificacao.urgencia ?? 'baixa')
  const tipo          = String(classificacao.tipo      ?? 'informativo')
  const acaoSugerida  = String(classificacao.acaoSugerida ?? '')

  const assunto = String(metadados.assunto ?? email.titulo ?? '(sem assunto)')
  const data    = email.criadoEm ? email.criadoEm.toLocaleDateString('pt-BR') : ''

  const linhas = [
    `Email recebido: ${assunto}`,
    data ? `Data: ${data}` : '',
    `Urgência: ${URGENCIA_PT[urgencia] ?? urgencia}`,
    `Tipo: ${TIPO_PT[tipo] ?? tipo}`,
    acaoSugerida ? `Ação sugerida: ${acaoSugerida}` : '',
    '',
    email.conteudo,
  ].filter(Boolean).join('\n')

  await indexar(linhas, {
    escopo:      email.clienteId ? 'cliente' : 'lead',
    canal:       'crm',          // email classificado é dado interno do escritório
    tipo:        'historico_crm',
    clienteId:   email.clienteId ?? undefined,
    leadId:      email.leadId    ?? undefined,
    titulo:      `Email: ${assunto}`,
    // Usa o mesmo documentoId da interação para SUBSTITUIR o entry básico pelo enriquecido
    documentoId: `interacao:${email.id}`,
    metadata:    email.criadoEm
      ? { dataReferencia: email.criadoEm.toISOString().slice(0, 10) }
      : undefined,
  }, keys)
}
