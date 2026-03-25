export type AIMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AIRequest = {
  system: string
  messages: AIMessage[]
  maxTokens?: number
  temperature?: number
}

export type AIResponse = {
  text: string
  provider: string
  model: string
}

export interface AIProvider {
  name: string
  complete(req: AIRequest): Promise<AIResponse>
}
