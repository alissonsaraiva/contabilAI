import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequest, AIResponse } from './types'

export const claudeProvider: AIProvider = {
  name: 'claude',

  async complete({ system, messages, maxTokens = 1024, temperature = 0.3, model, apiKey }: AIRequest): Promise<AIResponse> {
    const key = apiKey
    if (!key) throw new Error('ANTHROPIC_API_KEY não configurada')

    const client = new Anthropic({ apiKey: key })
    const resolvedModel = model ?? 'claude-haiku-4-5-20251001'

    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    return { text, provider: 'claude', model: resolvedModel }
  },
}
