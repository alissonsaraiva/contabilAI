// Google Gemini via endpoint OpenAI-compatible
// Docs: https://ai.google.dev/gemini-api/docs/openai
import type { AIProvider, AIRequest, AIResponse } from './types'

const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

export const googleProvider: AIProvider = {
  name: 'google',

  async complete({ system, messages, maxTokens = 1024, temperature = 0.3, model, apiKey }: AIRequest): Promise<AIResponse> {
    if (!apiKey) throw new Error('GOOGLE_API_KEY não configurada')

    const resolvedModel = model ?? 'gemini-2.0-flash'

    const res = await fetch(`${GOOGLE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
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
      throw new Error(`Google Gemini API error ${res.status}: ${err}`)
    }

    const data = await res.json() as {
      choices: { message: { content: string } }[]
      model: string
    }

    return {
      text: data.choices[0]?.message?.content ?? '',
      provider: 'google',
      model: data.model ?? resolvedModel,
    }
  },
}
