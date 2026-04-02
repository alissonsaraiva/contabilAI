import { z } from 'zod'

/**
 * dadosJson é um JSON livre armazenado no model Lead.
 * Pode conter chaves em PT-BR do wizard de onboarding
 * (ex: 'Nome completo', 'CPF', 'CNPJ') ou chaves camelCase
 * do widget WhatsApp legado (ex: 'nomeCompleto', 'nome').
 */
export const dadosJsonSchema = z.record(z.string(), z.unknown())
export type DadosJson = z.infer<typeof dadosJsonSchema>

/**
 * Converte o `JsonValue` do Prisma para um objeto tipado seguro.
 * Retorna `{}` se o valor for null, não-objeto, ou array.
 */
export function parseDadosJson(raw: unknown): DadosJson {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result = dadosJsonSchema.safeParse(raw)
  return result.success ? result.data : {}
}

/**
 * Lê um valor string de um `DadosJson` testando múltiplas chaves em ordem.
 * Retorna `undefined` se nenhuma chave existir ou o valor não for string não-vazia.
 */
export function getDadosString(dados: DadosJson, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = dados[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
}

/**
 * Extrai o nome de exibição do lead a partir do `dadosJson` bruto.
 * Testa as chaves mais comuns em ordem de prioridade.
 */
export function getNomeFromDadosJson(raw: unknown): string | undefined {
  const dados = parseDadosJson(raw)
  return getDadosString(
    dados,
    'nomeCompleto',        // widget WhatsApp legado (camelCase)
    'nome',                // variante camelCase
    'Nome completo',       // wizard CRM — PF
    'Nome',                // wizard CRM — PF curto
    'Razão Social / Nome', // wizard CRM — PJ
    'Razão Social',        // wizard CRM — PJ (campo avulso)
  )
}
