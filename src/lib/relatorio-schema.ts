// Tipos e utilitários para o formato JSON estruturado de relatórios

export type RelatorioKPI = {
  label: string
  valor: string | number
  destaque?: 'ok' | 'warning' | 'danger'
}

export type RelatorioSecaoTabela = {
  tipo: 'tabela'
  titulo: string
  colunas: string[]
  linhas: string[][]
}

export type RelatorioSecaoTexto = {
  tipo: 'texto'
  titulo?: string
  conteudo: string
}

export type RelatorioSecaoLista = {
  tipo: 'lista'
  titulo?: string
  itens: string[]
}

export type RelatorioSecao = RelatorioSecaoTabela | RelatorioSecaoTexto | RelatorioSecaoLista

export type RelatorioJSON = {
  version: 1
  kpis?: RelatorioKPI[]
  secoes: RelatorioSecao[]
}

/** Tenta parsear o conteúdo como RelatorioJSON. Retorna null se for texto livre. */
export function parseRelatorioJSON(conteudo: string): RelatorioJSON | null {
  try {
    const parsed = JSON.parse(conteudo)
    if (parsed?.version === 1 && Array.isArray(parsed?.secoes)) return parsed as RelatorioJSON
    return null
  } catch {
    return null
  }
}

/** Extrai texto plano do JSON para indexação RAG e preview */
export function relatorioJSONParaTexto(rel: RelatorioJSON): string {
  const linhas: string[] = []
  if (rel.kpis?.length) {
    for (const k of rel.kpis) linhas.push(`${k.label}: ${k.valor}`)
    linhas.push('')
  }
  for (const s of rel.secoes) {
    if (s.titulo) linhas.push(s.titulo)
    if (s.tipo === 'tabela') {
      linhas.push(s.colunas.join(' | '))
      for (const linha of s.linhas) linhas.push(linha.join(' | '))
    } else if (s.tipo === 'texto') {
      linhas.push(s.conteudo)
    } else if (s.tipo === 'lista') {
      for (const item of s.itens) linhas.push(`• ${item}`)
    }
    linhas.push('')
  }
  return linhas.join('\n').trim()
}

/** Gera preview de 220 chars a partir do JSON para exibir na lista */
export function relatorioJSONPreview(rel: RelatorioJSON): string {
  const partes: string[] = []
  if (rel.kpis?.length) {
    partes.push(rel.kpis.map(k => `${k.label}: ${k.valor}`).join(' · '))
  }
  for (const s of rel.secoes) {
    if (s.tipo === 'texto') partes.push(s.conteudo)
    else if (s.tipo === 'lista') partes.push(s.itens.join(', '))
    else if (s.tipo === 'tabela') partes.push(`Tabela: ${s.titulo} (${s.linhas.length} linhas)`)
  }
  return partes.join(' — ').substring(0, 220)
}
