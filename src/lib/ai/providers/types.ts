export type AIMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string }  // base64

export type AIMessage = {
  role: 'user' | 'assistant'
  content: string | AIMessageContentPart[]
}

export type AIRequest = {
  system: string
  messages: AIMessage[]
  maxTokens?: number
  temperature?: number
  model?: string
  apiKey?: string
  baseUrl?: string
}

export type AIResponse = {
  text: string
  provider: string
  model: string
}

// ─── Tool use ─────────────────────────────────────────────────────────────────

/** Definição de uma ferramenta exposta ao LLM */
export type ToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema
}

/** Chamada de ferramenta solicitada pelo LLM */
export type ToolCall = {
  id: string
  name: string
  input: Record<string, unknown>
}

/** Resultado de execução de uma ferramenta, devolvido ao LLM */
export type ToolResult = {
  toolCallId: string
  content: string
}

/** Partes de conteúdo estendidas para mensagens com tool use */
export type AIMessageContentPartToolUse = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export type AIMessageContentPartToolResult = {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

export type AnyContentPart =
  | AIMessageContentPart
  | AIMessageContentPartToolUse
  | AIMessageContentPartToolResult

/** Mensagem que suporta conteúdo de tool use (usada no agentic loop) */
export type AIMessageExtended = {
  role: 'user' | 'assistant'
  content: string | AnyContentPart[]
}

export type AIRequestWithTools = {
  system: string
  messages: AIMessageExtended[]
  tools: ToolDefinition[]
  maxTokens?: number
  temperature?: number
  model?: string
  apiKey?: string
  baseUrl?: string
}

export type AIResponseWithTools = {
  text: string
  provider: string
  model: string
  toolCalls: ToolCall[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
}

export interface AIProvider {
  name: string
  complete(req: AIRequest): Promise<AIResponse>
  completeWithTools?(req: AIRequestWithTools): Promise<AIResponseWithTools>
}
