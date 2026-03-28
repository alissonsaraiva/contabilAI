import type { Tool, ToolMeta, ToolCanal } from './types'
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

/**
 * Retorna as capacidades disponíveis para um canal específico, já formatadas
 * como texto para injetar no system prompt da IA.
 *
 * Exclui tools desabilitadas pelo escritório (`toolsDesabilitadas`).
 * Retorna string vazia se nenhuma tool estiver disponível para o canal.
 */
export function getCapacidadesPorCanal(
  canal: ToolCanal,
  desabilitadas: string[] = [],
): string {
  const tools = [...registry.values()].filter(
    t => t.meta.canais.includes(canal) && !desabilitadas.includes(t.definition.name),
  )

  if (tools.length === 0) return ''

  // Agrupa por categoria para leitura mais clara
  const porCategoria = new Map<string, string[]>()
  for (const t of tools) {
    const cat = t.meta.categoria
    if (!porCategoria.has(cat)) porCategoria.set(cat, [])
    porCategoria.get(cat)!.push(`• ${t.meta.label}: ${t.meta.descricao}`)
  }

  const linhas: string[] = [
    'CAPACIDADES DISPONÍVEIS (dados que você pode consultar ou ações que pode executar quando solicitado):',
  ]
  for (const [cat, items] of porCategoria) {
    linhas.push(`\n${cat}:`)
    linhas.push(...items)
  }

  return linhas.join('\n')
}
