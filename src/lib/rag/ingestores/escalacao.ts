import { indexar, getEmbeddingKeys } from './_core'

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
