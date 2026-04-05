const DEFAULT_CHUNK_SIZE = 400    // tokens aproximados (~1600 chars)
const CHUNK_OVERLAP_RATIO = 0.20  // 20% de sobreposição — garante continuidade de contexto
// Fator de conversão: ~4 chars por token (estimativa para português)
const CHARS_PER_TOKEN = 4

// Tamanhos de chunk por tipo de conteúdo.
// Normativos e documentos longos beneficiam de chunks maiores para não quebrar
// tabelas de alíquota, parágrafos de lei ou cláusulas contratuais no meio.
export const CHUNK_SIZES: Record<string, number> = {
  fiscal_normativo:  700,   // tabelas de alíquota, IN RFB, legislação — requer contexto amplo
  documento_cliente: 600,   // contratos, demonstrativos — parágrafos longos
  template:          600,   // modelos de documentos
  dados_empresa:     300,   // fichas cadastrais curtas — chunk menor = busca mais precisa
  dados_lead:        300,
  nota_fiscal:       300,
  obrigacao_fiscal:  400,
  base_conhecimento: 400,
  historico_crm:     400,
  historico_agente:  300,
}

export function chunkText(text: string, tipo?: string): string[] {
  const chunkSize = tipo && CHUNK_SIZES[tipo] ? CHUNK_SIZES[tipo] : DEFAULT_CHUNK_SIZE
  const overlapTokens = Math.round(chunkSize * CHUNK_OVERLAP_RATIO)

  const clean = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!clean) return []

  // Divide por parágrafos primeiro
  const paragraphs = clean.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const tentative = current ? `${current}\n\n${para}` : para
    if (tentative.length > chunkSize * CHARS_PER_TOKEN) {
      // Parágrafo grande: salva o atual e começa novo
      if (current) chunks.push(current.trim())
      // Divide o parágrafo por sentenças
      const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para]
      let sub = ''
      for (const s of sentences) {
        if ((sub + s).length > chunkSize * CHARS_PER_TOKEN) {
          if (sub) chunks.push(sub.trim())
          sub = s
        } else {
          sub += s
        }
      }
      if (sub) current = sub
    } else if (tentative.length > chunkSize * CHARS_PER_TOKEN) {
      if (current) chunks.push(current.trim())
      current = para
    } else {
      current = tentative
    }
  }
  if (current) chunks.push(current.trim())

  // Aplica sobreposição entre chunks
  if (chunks.length <= 1) return chunks
  const overlapped: string[] = [chunks[0]]
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]
    const overlap = prev.slice(-overlapTokens * CHARS_PER_TOKEN)
    overlapped.push(`${overlap}\n${chunks[i]}`.trim())
  }
  return overlapped.filter(c => c.length > 20)
}
