import type { AIProvider, AIRequest, AIResponse, AIMessageContentPart } from './types'

export const openaiProvider: AIProvider = {
  name: 'openai',

  async complete({ system, messages, maxTokens = 1024, temperature = 0.3, model, apiKey, baseUrl }: AIRequest): Promise<AIResponse> {
    const key = apiKey
    if (!key) throw new Error('OPENAI_API_KEY não configurada')

    const resolvedModel = model ?? 'gpt-4o-mini'
    const resolvedBaseUrl = baseUrl ?? 'https://api.openai.com/v1'

    const res = await fetch(`${resolvedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
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
