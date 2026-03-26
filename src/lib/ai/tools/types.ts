import type { ToolDefinition } from '../providers/types'

// ─── Contexto passado para toda execução de ferramenta ────────────────────────

export type ToolContext = {
  /** ID do cliente sendo atendido (quando disponível) */
  clienteId?: string
  /** ID do lead sendo atendido (quando disponível) */
  leadId?: string
  /** Qual IA está solicitando a execução — usado para auditoria */
  solicitanteAI: string  // 'crm' | 'whatsapp' | 'portal' | 'onboarding'
}

// ─── Resultado padronizado de qualquer ferramenta ─────────────────────────────

export type ToolExecuteResult = {
  sucesso: boolean
  /** Dados estruturados retornados pela ferramenta (para uso interno/logs) */
  dados?: unknown
  /** Mensagem de erro legível (quando sucesso = false) */
  erro?: string
  /**
   * Resumo em texto natural para o LLM processar e formular a resposta final.
   * Deve ser descritivo o suficiente para o modelo entender o resultado sem
   * precisar interpretar `dados` diretamente.
   */
  resumo: string
}

// ─── Interface que toda ferramenta deve implementar ───────────────────────────

export interface Tool {
  /** Definição exposta ao LLM (nome, descrição, JSON Schema do input) */
  definition: ToolDefinition
  /** Executa a ferramenta com o input validado pelo LLM e o contexto da chamada */
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult>
}
