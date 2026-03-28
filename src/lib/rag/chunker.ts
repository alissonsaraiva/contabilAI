const CHUNK_SIZE = 400    // tokens aproximados
const CHUNK_OVERLAP = 80  // tokens de sobreposição — 20% do chunk size, garante continuidade de contexto em docs contábeis/legais
// Fator de conversão: ~4 chars por token (estimativa para português)
const CHARS_PER_TOKEN = 4

export function chunkText(text: string): string[] {
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
    if (tentative.length > CHUNK_SIZE * CHARS_PER_TOKEN) {
      // Parágrafo grande: salva o atual e começa novo
      if (current) chunks.push(current.trim())
      // Divide o parágrafo por sentenças
      const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para]
      let sub = ''
      for (const s of sentences) {
        if ((sub + s).length > CHUNK_SIZE * CHARS_PER_TOKEN) {
          if (sub) chunks.push(sub.trim())
          sub = s
        } else {
          sub += s
        }
      }
      if (sub) current = sub
    } else if (tentative.length > CHUNK_SIZE * CHARS_PER_TOKEN) {
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
    const overlap = prev.slice(-CHUNK_OVERLAP * CHARS_PER_TOKEN)
    overlapped.push(`${overlap}\n${chunks[i]}`.trim())
  }
  return overlapped.filter(c => c.length > 20)
}
