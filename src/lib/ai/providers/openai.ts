import type { AIProvider, AIRequest, AIResponse } from './types'

// Compatível com OpenAI e qualquer API com formato OpenAI-compatible
// (ex: Groq, DeepSeek, Together AI, Mistral, etc.)
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

export const openaiProvider: AIProvider = {
  name: 'openai',

  async complete({ system, messages, maxTokens = 1024, temperature = 0.3 }: AIRequest): Promise<AIResponse> {
    const key = process.env.OPENAI_API_KEY
    if (!key) throw new Error('OPENAI_API_KEY não configurada')

    const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL
    const baseUrl = process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
    }

    const data = await res.json() as {
      choices: { message: { content: string } }[]
      model: string
    }

    return {
      text: data.choices[0]?.message?.content ?? '',
      provider: 'openai',
      model: data.model,
    }
  },
}
