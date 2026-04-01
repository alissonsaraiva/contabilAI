import type { ToolDefinition } from '../providers/types'

// ─── Contexto passado para toda execução de ferramenta ────────────────────────

export type ToolContext = {
  /** ID do cliente sendo atendido (quando disponível) */
  clienteId?: string
  /** ID do lead sendo atendido (quando disponível) */
  leadId?: string
  /**
   * ID da empresa vinculada ao cliente ou sócio logado no portal.
   * Obrigatório no canal portal — sócios não têm clienteId, apenas empresaId.
   * Quando presente, use-o para scopar dados da empresa.
   */
  empresaId?: string
  /** ID da conversa ativa — necessário para tools que acessam mensagens da sessão (ex: anexarDocumentoChat) */
  conversaId?: string
  /** Qual IA está solicitando a execução — usado para auditoria */
  solicitanteAI: string  // 'crm' | 'whatsapp' | 'portal' | 'onboarding'
  /** ID do usuário autenticado que acionou o agente (somente canal CRM) */
  usuarioId?: string
  /** Nome legível do usuário para o agente usar na resposta e no log */
  usuarioNome?: string
  /** Tipo do usuário: 'admin' | 'contador' | 'atendente' */
  usuarioTipo?: string
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

// ─── Metadados de UI para cada ferramenta ─────────────────────────────────────
// Exibidos em Configurações → IA → Agente Operacional.
// Fonte única de verdade: quem adiciona uma tool DEVE preencher este objeto.
// O TypeScript não compilará se `meta` estiver ausente.

export type ToolCanal = 'crm' | 'whatsapp' | 'portal' | 'onboarding'
export type ToolCategoria = 'Tarefas' | 'Clientes' | 'Funil' | 'Histórico' | string

export type ToolMeta = {
  /** Rótulo legível exibido na interface */
  label: string
  /** Descrição exibida na interface (pode ser mais longa que a descrição do LLM) */
  descricao: string
  /** Agrupamento visual na tela de capacidades */
  categoria: ToolCategoria
  /** Quais canais têm acesso a esta ferramenta */
  canais: ToolCanal[]
}

// ─── Interface que toda ferramenta deve implementar ───────────────────────────

export interface Tool {
  /** Definição exposta ao LLM (nome, descrição, JSON Schema do input) */
  definition: ToolDefinition
  /** Metadados para exibição na tela de capacidades do Agente Operacional */
  meta: ToolMeta
  /** Executa a ferramenta com o input validado pelo LLM e o contexto da chamada */
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult>
}
