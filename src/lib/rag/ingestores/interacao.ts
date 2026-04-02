import { indexar, getEmbeddingKeys } from './_core'

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
