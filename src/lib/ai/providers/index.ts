import type { AIProvider } from './types'
import { claudeProvider } from './claude'
import { openaiProvider } from './openai'

const PROVIDERS: Record<string, AIProvider> = {
  claude: claudeProvider,
  openai: openaiProvider,
  // Para usar Groq, DeepSeek, Together AI etc. (formato OpenAI-compatible):
  // basta apontar OPENAI_BASE_URL para o endpoint e AI_PROVIDER=openai
}

export function getProvider(): AIProvider {
  const name = process.env.AI_PROVIDER ?? 'claude'
  const provider = PROVIDERS[name]
  if (!provider) throw new Error(`AI provider desconhecido: "${name}". Opções: ${Object.keys(PROVIDERS).join(', ')}`)
  return provider
}

export type { AIProvider, AIRequest, AIResponse, AIMessage } from './types'
