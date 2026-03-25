import { embedText, searchSimilar } from '@/lib/rag'
import type { SearchOpts, SearchResult } from '@/lib/rag'
import type { TipoConhecimento } from '@/lib/rag/types'
import { getProvider } from './providers'
import type { AIMessage } from './providers'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AskContext =
  | { escopo: 'global' }
  | { escopo: 'cliente'; clienteId: string }
  | { escopo: 'lead';    leadId: string }
  | { escopo: 'cliente+global'; clienteId: string }  // portal: base global + dados do cliente
  | { escopo: 'lead+global';    leadId: string }     // onboarding: base global + dados do lead

export type AskOpts = {
  pergunta: string
  context: AskContext
  historico?: AIMessage[]        // mensagens anteriores do chat
  systemExtra?: string           // instrução adicional por feature
  tipos?: TipoConhecimento[]     // restringir tipos de chunks
  maxChunks?: number             // quantos chunks incluir no contexto (default 5)
  maxTokens?: number
}

export type AskResult = {
  resposta: string
  fontes: SearchResult[]
  provider: string
  model: string
}

// ─── System prompt base ───────────────────────────────────────────────────────

const SYSTEM_BASE = `Você é o assistente virtual da ContabAI, um escritório de contabilidade digital especializado em MEI, EPP e autônomos no Brasil.

Diretrizes:
- Responda sempre em português brasileiro, de forma clara e objetiva
- Use o contexto fornecido para embasar suas respostas
- Se não encontrar informação suficiente no contexto, seja honesto e diga que vai verificar com a equipe
- Nunca invente valores, prazos ou obrigações fiscais — se não tiver certeza, indique que é necessário confirmar
- Seja cordial mas profissional
- Para dúvidas complexas, sugira falar com o contador responsável`

// ─── Função principal ─────────────────────────────────────────────────────────

export async function askAI(opts: AskOpts): Promise<AskResult> {
  const { pergunta, context, historico = [], systemExtra, tipos, maxChunks = 5, maxTokens = 1024 } = opts

  // 1. Busca RAG com base no escopo
  const searchOpts = buildSearchOpts(context, tipos, maxChunks)
  let fontes: SearchResult[] = []

  try {
    const embedding = await embedText(pergunta)
    fontes = await searchSimilar(embedding, searchOpts)
  } catch {
    // RAG indisponível (env vars não configuradas) — continua sem contexto
  }

  // 2. Monta system prompt
  const systemParts = [SYSTEM_BASE]
  if (systemExtra) systemParts.push(systemExtra)
  if (fontes.length > 0) {
    systemParts.push('\n--- CONTEXTO RELEVANTE ---')
    fontes.forEach((f, i) => {
      const label = f.titulo ? `[${i + 1}] ${f.titulo}` : `[${i + 1}]`
      systemParts.push(`${label}\n${f.conteudo}`)
    })
    systemParts.push('--- FIM DO CONTEXTO ---')
  }

  // 3. Chama o provider configurado
  const provider = getProvider()
  const result = await provider.complete({
    system: systemParts.join('\n\n'),
    messages: [
      ...historico,
      { role: 'user', content: pergunta },
    ],
    maxTokens,
    temperature: 0.3,
  })

  return {
    resposta: result.text,
    fontes,
    provider: result.provider,
    model: result.model,
  }
}

// ─── Helper: monta SearchOpts a partir do contexto ───────────────────────────

function buildSearchOpts(
  context: AskContext,
  tipos: TipoConhecimento[] | undefined,
  limit: number,
): SearchOpts {
  const base: SearchOpts = { limit, minSimilarity: 0.45, tipos }

  switch (context.escopo) {
    case 'global':
      return { ...base, escopo: 'global' }

    case 'cliente':
      return { ...base, clienteId: context.clienteId }

    case 'lead':
      return { ...base, leadId: context.leadId }

    case 'cliente+global':
      return { ...base, clienteId: context.clienteId, incluirGlobal: true }

    case 'lead+global':
      return { ...base, leadId: context.leadId, incluirGlobal: true }
  }
}
