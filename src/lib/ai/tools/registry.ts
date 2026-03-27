import type { Tool, ToolMeta } from './types'
import type { ToolDefinition } from '../providers/types'

export type CapacidadeUI = ToolMeta & { tool: string }

// ─── Registry global (singleton por processo Node) ───────────────────────────

const registry = new Map<string, Tool>()

/**
 * Registra uma ferramenta no registry global.
 * Chamado uma vez no módulo de cada tool (via import em index.ts).
 */
export function registrarTool(tool: Tool): void {
  registry.set(tool.definition.name, tool)
}

/**
 * Retorna as ferramentas disponíveis.
 * @param nomes - Se fornecido, filtra apenas as tools com esses nomes (whitelist).
 *                Se undefined, retorna todas as registradas.
 */
export function getTools(nomes?: string[]): Tool[] {
  if (!nomes) return [...registry.values()]
  return nomes
    .map(n => registry.get(n))
    .filter((t): t is Tool => t !== undefined)
}

/**
 * Retorna apenas as definições (sem o método execute) — usado para passar ao LLM.
 */
export function getToolDefinitions(nomes?: string[]): ToolDefinition[] {
  return getTools(nomes).map(t => t.definition)
}

/** Busca uma tool específica pelo nome (para executar após o LLM requisitar). */
export function getTool(nome: string): Tool | undefined {
  return registry.get(nome)
}

/**
 * Retorna os metadados de UI de todas as tools registradas.
 * Usado pela página Configurações → IA → Agente Operacional.
 * Fonte única de verdade — sempre em sincronia com as tools reais.
 */
export function getCapacidades(): CapacidadeUI[] {
  return [...registry.values()].map(t => ({ tool: t.definition.name, ...t.meta }))
}
