import { embedText, searchSimilar } from '@/lib/rag'
import type { SearchOpts, SearchResult } from '@/lib/rag'
import type { TipoConhecimento, CanalRAG } from '@/lib/rag/types'
import { getProvider } from './providers'
import type { AIMessage } from './providers'
import { getAiConfig } from './config'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AskContext =
  | { escopo: 'global' }
  | { escopo: 'cliente';       clienteId: string }
  | { escopo: 'lead';          leadId: string }
  | { escopo: 'cliente+global'; clienteId: string }
  | { escopo: 'lead+global';    leadId: string }

export type AskFeature = 'onboarding' | 'crm' | 'portal'

export type AskOpts = {
  pergunta: string
  context: AskContext
  feature?: AskFeature | 'whatsapp'
  historico?: AIMessage[]
  systemExtra?: string   // appended after the base prompt
  tipos?: TipoConhecimento[]
  maxChunks?: number
  maxTokens?: number
}

export type AskResult = {
  resposta: string
  fontes: SearchResult[]
  provider: string
  model: string
}

// ─── System prompt padrão (fallback quando não há prompt configurado no DB) ───

export const SYSTEM_BASE_DEFAULT = `Você é o assistente virtual da ContabAI, um escritório de contabilidade digital especializado em MEI, EPP e autônomos no Brasil.

Diretrizes:
- Responda sempre em português brasileiro, de forma clara e objetiva
- Use o contexto fornecido para embasar suas respostas
- Se não encontrar informação suficiente no contexto, seja honesto e diga que vai verificar com a equipe
- Nunca invente valores, prazos ou obrigações fiscais — se não tiver certeza, indique que é necessário confirmar
- Seja cordial mas profissional
- Para dúvidas complexas, sugira falar com o contador responsável`

// ─── Função principal ─────────────────────────────────────────────────────────

export async function askAI(opts: AskOpts): Promise<AskResult> {
  const {
    pergunta,
    context,
    feature = 'onboarding',
    historico = [],
    systemExtra,
    tipos,
    maxChunks = 5,
    maxTokens = 1024,
  } = opts

  // 1. Carrega configuração (DB > env vars)
  const config = await getAiConfig()

  // 2. Busca RAG — passa o canal da feature para filtrar a base de conhecimento
  const canal = featureToCanal(feature)
  const searchOpts = buildSearchOpts(context, tipos, maxChunks, canal)
  let fontes: SearchResult[] = []
  try {
    if (config.voyageApiKey) {
      const embedding = await embedText(pergunta)
      fontes = await searchSimilar(embedding, searchOpts)
    }
  } catch {
    // RAG indisponível — continua sem contexto
  }

  // 3. Monta system prompt — usa o do DB se configurado, senão o padrão
  const storedPrompt = feature ? config.systemPrompts[feature as keyof typeof config.systemPrompts] : null
  const systemParts = [storedPrompt ?? SYSTEM_BASE_DEFAULT]
  if (systemExtra) systemParts.push(systemExtra)
  if (fontes.length > 0) {
    systemParts.push('\n--- CONTEXTO RELEVANTE ---')
    fontes.forEach((f, i) => {
      const label = f.titulo ? `[${i + 1}] ${f.titulo}` : `[${i + 1}]`
      systemParts.push(`${label}\n${f.conteudo}`)
    })
    systemParts.push('--- FIM DO CONTEXTO ---')
  }

  // 4. Resolve modelo por feature (whatsapp usa o modelo do onboarding como fallback)
  const modelFeature = (feature === 'whatsapp' ? 'onboarding' : feature) as AskFeature
  const model = config.models[modelFeature]

  // 5. Chama o provider com credenciais da config
  const provider = getProvider(config.provider)
  const result = await provider.complete({
    system: systemParts.join('\n\n'),
    messages: [...historico, { role: 'user', content: pergunta }],
    maxTokens,
    temperature: 0.3,
    model,
    apiKey: config.provider === 'claude' ? config.anthropicApiKey ?? undefined : config.openaiApiKey ?? undefined,
    baseUrl: config.openaiBaseUrl ?? undefined,
  })

  return { resposta: result.text, fontes, provider: result.provider, model: result.model }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function featureToCanal(feature: AskFeature | 'whatsapp' | undefined): CanalRAG {
  switch (feature) {
    case 'onboarding': return 'onboarding'
    case 'crm':        return 'crm'
    case 'portal':     return 'portal'
    case 'whatsapp':   return 'whatsapp'
    default:           return 'geral'
  }
}

function buildSearchOpts(
  context: AskContext,
  tipos: TipoConhecimento[] | undefined,
  limit: number,
  canal: CanalRAG,
): SearchOpts {
  const base: SearchOpts = { limit, minSimilarity: 0.45, tipos, canal }
  switch (context.escopo) {
    case 'global':          return { ...base, escopo: 'global' }
    case 'cliente':         return { ...base, clienteId: context.clienteId }
    case 'lead':            return { ...base, leadId: context.leadId }
    case 'cliente+global':  return { ...base, clienteId: context.clienteId, incluirGlobal: true }
    case 'lead+global':     return { ...base, leadId: context.leadId, incluirGlobal: true }
  }
}
