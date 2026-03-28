/**
 * Serviço de consulta de CNPJ via BrasilAPI (gratuito, sem auth).
 *
 * Usado pelo endpoint /api/cnpj/[cnpj] para evitar CORS e centralizar
 * cache server-side. Não chamar diretamente do client.
 *
 * Cache in-process: TTL 24h, máximo 500 entradas.
 */

const BRASILIA_API = 'https://brasilapi.com.br/api/cnpj/v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000   // 24 horas
const CACHE_MAX    = 500

export type DadosCNPJ = {
  cnpj:               string
  razaoSocial:        string
  nomeFantasia:       string | null
  situacao:           string                  // 'ATIVA' | 'BAIXADA' | 'INAPTA' | ...
  logradouro:         string
  numero:             string
  complemento:        string | null
  bairro:             string
  municipio:          string
  uf:                 string
  cep:                string                  // apenas dígitos: '60120120'
  opcaoMei:           boolean
  opcaoSimples:       boolean
  regime:             'MEI' | 'SimplesNacional' | 'outro'
  atividadePrincipal: string | null
}

// ─── Cache in-process ─────────────────────────────────────────────────────────
type CacheEntry = { dados: DadosCNPJ; expiresAt: number }
const cache = new Map<string, CacheEntry>()

function cacheGet(cnpj: string): DadosCNPJ | null {
  const entry = cache.get(cnpj)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(cnpj); return null }
  return entry.dados
}

function cachePut(cnpj: string, dados: DadosCNPJ): void {
  if (cache.size >= CACHE_MAX) {
    // Evict primeiro da fila
    cache.delete(cache.keys().next().value!)
  }
  cache.set(cnpj, { dados, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─── Lookup ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrasilAPIResponse = Record<string, any>

export async function consultarCNPJ(cnpj: string): Promise<DadosCNPJ> {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) throw new Error('CNPJ deve ter 14 dígitos')

  const cached = cacheGet(digits)
  if (cached) return cached

  const res = await fetch(`${BRASILIA_API}/${digits}`, {
    next: { revalidate: 0 },   // não cachear no Next.js — gerenciamos manualmente
  })

  if (res.status === 404) throw new Error('CNPJ não encontrado na base da Receita Federal')
  if (!res.ok) throw new Error(`Erro na consulta: ${res.status}`)

  const raw: BrasilAPIResponse = await res.json()

  const opcaoMei     = !!raw.opcao_pelo_mei
  const opcaoSimples = !!raw.opcao_pelo_simples
  const regime: DadosCNPJ['regime'] =
    opcaoMei     ? 'MEI'            :
    opcaoSimples ? 'SimplesNacional' : 'outro'

  const dados: DadosCNPJ = {
    cnpj:               digits,
    razaoSocial:        String(raw.razao_social    ?? '').trim(),
    nomeFantasia:       raw.nome_fantasia          ? String(raw.nome_fantasia).trim() || null : null,
    situacao:           String(raw.descricao_situacao_cadastral ?? '').toUpperCase(),
    logradouro:         String(raw.logradouro      ?? '').trim(),
    numero:             String(raw.numero          ?? '').trim(),
    complemento:        raw.complemento            ? String(raw.complemento).trim() || null : null,
    bairro:             String(raw.bairro          ?? '').trim(),
    municipio:          String(raw.municipio       ?? '').trim(),
    uf:                 String(raw.uf              ?? '').toUpperCase(),
    cep:                String(raw.cep             ?? '').replace(/\D/g, ''),
    opcaoMei,
    opcaoSimples,
    regime,
    atividadePrincipal: Array.isArray(raw.atividade_principal) && raw.atividade_principal[0]
      ? String(raw.atividade_principal[0].text ?? '').trim() || null
      : null,
  }

  cachePut(digits, dados)
  return dados
}
