import type { AIProvider } from './types'
import { claudeProvider } from './claude'
import { openaiProvider } from './openai'
import { googleProvider } from './google'

const PROVIDERS: Record<string, AIProvider> = {
  claude:  claudeProvider,
  openai:  openaiProvider,
  google:  googleProvider,
}

export function getProvider(name: string): AIProvider {
  const provider = PROVIDERS[name]
  if (!provider) throw new Error(`AI provider desconhecido: "${name}". Opções: ${Object.keys(PROVIDERS).join(', ')}`)
  return provider
}

export type { AIProvider, AIRequest, AIResponse, AIMessage } from './types'
