import type {
  AIProvider, AIRequest, AIResponse, AIMessageContentPart,
  AIRequestWithTools, AIResponseWithTools, AIMessageExtended, AnyContentPart,
} from './types'

// ─── Mapeamento OpenAI-compatible (usado também pelo Google) ──────────────────

type OpenAIMessage = Record<string, unknown>

/**
 * Converte AIMessageExtended[] (formato interno do agente) para mensagens
 * no formato OpenAI chat completions, incluindo tool_calls e tool results.
 */
export function mapToOpenAIMessages(messages: AIMessageExtended[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content })
      continue
    }

    const parts = msg.content as AnyContentPart[]

    if (msg.role === 'assistant') {
      const textParts  = parts.filter(p => p.type === 'text')
      const toolUses   = parts.filter(p => p.type === 'tool_use')
      const text       = textParts.map(p => (p as { type: 'text'; text: string }).text).join('')

      if (toolUses.length > 0) {
        result.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolUses.map(tu => {
            const t = tu as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
            return { id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.input) } }
          }),
        })
      } else {
        result.push({ role: 'assistant', content: text })
      }
    } else {
      // role === 'user' — pode conter tool_result ou conteúdo normal
      const toolResults = parts.filter(p => p.type === 'tool_result')
      const textParts   = parts.filter(p => p.type === 'text' || p.type === 'image')

      for (const tr of toolResults) {
        const t = tr as { type: 'tool_result'; tool_use_id: string; content: string }
        result.push({ role: 'tool', tool_call_id: t.tool_use_id, content: t.content })
      }

      if (textParts.length > 0) {
        result.push({
          role: 'user',
          content: textParts.map(p => {
            if (p.type === 'text') return { type: 'text', text: (p as { type: 'text'; text: string }).text }
            const img = p as { type: 'image'; mediaType: string; data: string }
            return { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } }
          }),
        })
      }
    }
  }

  return result
}

type OpenAIToolCallResponse = {
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

// ─── Provider OpenAI ──────────────────────────────────────────────────────────

export const openaiProvider: AIProvider = {
  name: 'openai',

  async complete({ system, messages, maxTokens = 1024, temperature = 0.3, model, apiKey, baseUrl }: AIRequest): Promise<AIResponse> {
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada')

    const resolvedModel   = model ?? 'gpt-4o-mini'
    const resolvedBaseUrl = baseUrl?.trim() || 'https://api.openai.com/v1'

    const res = await fetch(`${resolvedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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

    const data = await res.json() as { choices: { message: { content: string } }[]; model: string }
    return { text: data.choices[0]?.message?.content ?? '', provider: 'openai', model: data.model }
  },

  async completeWithTools({ system, messages, tools, maxTokens = 2048, temperature = 0.1, model, apiKey, baseUrl }: AIRequestWithTools): Promise<AIResponseWithTools> {
    if (!apiKey) throw new Error('OPENAI_API_KEY não configurada')

    const resolvedModel   = model ?? 'gpt-4o-mini'
    const resolvedBaseUrl = baseUrl?.trim() || 'https://api.openai.com/v1'

    const res = await fetch(`${resolvedBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
    }

    const data = await res.json() as OpenAIToolCallResponse
    const choice = data.choices[0]

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

    return { text, provider: 'openai', model: data.model ?? resolvedModel, toolCalls, stopReason }
  },
}
