// Google Gemini via endpoint OpenAI-compatible
// Docs: https://ai.google.dev/gemini-api/docs/openai
import type {
  AIProvider, AIRequest, AIResponse, AIMessageContentPart,
  AIRequestWithTools, AIResponseWithTools,
} from './types'
import { mapToOpenAIMessages } from './openai'

const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

type GoogleToolCallResponse = {
  choices: Array<{
    message: {
      content: string | null
      tool_calls?: Array<{
        id: string
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: string
  }>
  model: string
}

function googleHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'x-goog-api-key': apiKey,
  }
}

export const googleProvider: AIProvider = {
  name: 'google',

  async complete({ system, messages, maxTokens = 1024, temperature = 0.3, model, apiKey }: AIRequest): Promise<AIResponse> {
    if (!apiKey) throw new Error('GOOGLE_API_KEY não configurada')

    const resolvedModel = model ?? 'gemini-2.5-flash'

    const ctrl1 = new AbortController()
    const t1 = setTimeout(() => ctrl1.abort(), 60_000)
    let res: Response
    try {
      res = await fetch(`${GOOGLE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: googleHeaders(apiKey),
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
        signal: ctrl1.signal,
      })
    } finally {
      clearTimeout(t1)
    }

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Google Gemini API error ${res.status}: ${err.slice(0, 300)}`)
    }

    const data = await res.json() as { choices: { message: { content: string } }[]; model: string }
    return { text: data.choices[0]?.message?.content ?? '', provider: 'google', model: data.model ?? resolvedModel }
  },

  async completeWithTools({ system, messages, tools, maxTokens = 2048, temperature = 0.1, model, apiKey }: AIRequestWithTools): Promise<AIResponseWithTools> {
    if (!apiKey) throw new Error('GOOGLE_API_KEY não configurada')

    const resolvedModel = model ?? 'gemini-2.5-flash'

    const ctrl2 = new AbortController()
    const t2 = setTimeout(() => ctrl2.abort(), 60_000)
    let res: Response
    try {
      res = await fetch(`${GOOGLE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: googleHeaders(apiKey),
        body: JSON.stringify({
          model: resolvedModel,
          max_tokens: maxTokens,
          temperature,
          tools: tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          })),
          tool_choice: 'auto',
          messages: [
            { role: 'system', content: system },
            ...mapToOpenAIMessages(messages),
          ],
        }),
        signal: ctrl2.signal,
      })
    } finally {
      clearTimeout(t2)
    }

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Google Gemini API error ${res.status}: ${err.slice(0, 300)}`)
    }

    const data = await res.json() as GoogleToolCallResponse
    const choice = data.choices[0]!

    const text      = choice.message.content ?? ''
    const toolCalls = (choice.message.tool_calls ?? []).map(tc => ({
      id:    tc.id,
      name:  tc.function.name,
      input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }))

    const stopReason =
      choice.finish_reason === 'tool_calls' ? 'tool_use'   :
      choice.finish_reason === 'length'     ? 'max_tokens' :
      'end_turn'

    return { text, provider: 'google', model: data.model ?? resolvedModel, toolCalls, stopReason }
  },
}
