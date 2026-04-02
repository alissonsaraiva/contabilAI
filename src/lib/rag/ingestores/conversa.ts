import { indexar, getEmbeddingKeys } from './_core'
import type { CanalRAG } from '@/lib/rag'

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
