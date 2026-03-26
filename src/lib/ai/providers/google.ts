// Google Gemini via endpoint OpenAI-compatible
// Docs: https://ai.google.dev/gemini-api/docs/openai
import type { AIProvider, AIRequest, AIResponse, AIMessageContentPart } from './types'

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
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string'
              ? m.content
              : m.content.map((part: AIMessageContentPart) =>
                  part.type === 'text'
                    ? { type: 'text', text: part.text }
                    : { type: 'image_url', image_url: { url: `data:${part.mediaType};base64,${part.data}` } }
                ),
          })),
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Google Gemini API error ${res.status}: ${err.slice(0, 300)}`)
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
