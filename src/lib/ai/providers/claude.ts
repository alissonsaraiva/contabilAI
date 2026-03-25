import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, AIRequest, AIResponse } from './types'

const MODEL = 'claude-haiku-4-5-20251001'

export const claudeProvider: AIProvider = {
  name: 'claude',

  async complete({ system, messages, maxTokens = 1024, temperature = 0.3 }: AIRequest): Promise<AIResponse> {
    const key = process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('ANTHROPIC_API_KEY não configurada')

    const client = new Anthropic({ apiKey: key })

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    return { text, provider: 'claude', model: MODEL }
  },
}
