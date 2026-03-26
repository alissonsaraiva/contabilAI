import Anthropic from '@anthropic-ai/sdk'
import type {
  AIProvider, AIRequest, AIResponse, AIMessageContentPart,
  AIRequestWithTools, AIResponseWithTools, AnyContentPart,
} from './types'

function mapContentPart(part: AIMessageContentPart) {
  return part.type === 'text'
    ? { type: 'text' as const, text: part.text }
    : { type: 'image' as const, source: { type: 'base64' as const, media_type: part.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: part.data } }
}

function mapExtendedContentPart(part: AnyContentPart): Anthropic.Messages.ContentBlockParam {
  if (part.type === 'text')     return { type: 'text', text: part.text }
  if (part.type === 'image')    return { type: 'image', source: { type: 'base64', media_type: part.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: part.data } }
  if (part.type === 'tool_use') return { type: 'tool_use', id: part.id, name: part.name, input: part.input }
  // tool_result
  return { type: 'tool_result', tool_use_id: part.tool_use_id, content: part.content }
}

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
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? m.content
          : m.content.map((part: AIMessageContentPart) => mapContentPart(part)),
      })),
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    return { text, provider: 'claude', model: resolvedModel }
  },

  async completeWithTools({ system, messages, tools, maxTokens = 2048, temperature = 0.3, model, apiKey }: AIRequestWithTools): Promise<AIResponseWithTools> {
    const key = apiKey
    if (!key) throw new Error('ANTHROPIC_API_KEY não configurada')

    const client = new Anthropic({ apiKey: key })
    const resolvedModel = model ?? 'claude-haiku-4-5-20251001'

    const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
    }))

    const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string'
        ? m.content
        : (m.content as AnyContentPart[]).map(mapExtendedContentPart),
    }))

    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens,
      temperature,
      system,
      tools: anthropicTools,
      messages: anthropicMessages,
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')

    const toolCalls = response.content
      .filter(b => b.type === 'tool_use')
      .map(b => {
        const block = b as Anthropic.ToolUseBlock
        return { id: block.id, name: block.name, input: block.input as Record<string, unknown> }
      })

    const stopReason =
      response.stop_reason === 'tool_use'  ? 'tool_use'  :
      response.stop_reason === 'max_tokens' ? 'max_tokens' :
      'end_turn'

    return { text, provider: 'claude', model: resolvedModel, toolCalls, stopReason }
  },
}
