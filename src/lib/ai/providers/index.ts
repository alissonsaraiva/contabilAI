import type { AIProvider } from './types'
import { claudeProvider } from './claude'
import { openaiProvider } from './openai'

const PROVIDERS: Record<string, AIProvider> = {
  claude: claudeProvider,
  openai: openaiProvider,
  // OpenAI-compatible (Groq, DeepSeek, Together AI, Mistral, etc.):
  // AI_PROVIDER=openai + OPENAI_BASE_URL=https://api.groq.com/openai/v1
}

export function getProvider(name: string): AIProvider {
  const provider = PROVIDERS[name]
  if (!provider) throw new Error(`AI provider desconhecido: "${name}". Opções: ${Object.keys(PROVIDERS).join(', ')}`)
  return provider
}

export type { AIProvider, AIRequest, AIResponse, AIMessage } from './types'
