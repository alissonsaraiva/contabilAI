// Utilitário compartilhado — sem dependências de servidor
// Usado pelo WhatsApp (human-like.ts) e pelo chat widget do onboarding

const MAX_CHUNK_CHARS = 220

// Remove formatação markdown que não fica bem em chats
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')                // code blocks (antes dos outros)
    .replace(/\*\*(.+?)\*\*/gs, '$1')              // **bold** → bold
    .replace(/\*(.+?)\*/gs, '$1')                  // *italic* → italic
    .replace(/__(.+?)__/gs, '$1')                  // __bold__ → bold
    .replace(/_(.+?)_/gs, '$1')                    // _italic_ → italic
    .replace(/^#{1,6}\s+/gm, '')                   // # headers
    .replace(/---+/g, '')                          // --- separadores (inline ou linha)
    .replace(/`([^`]+)`/g, '$1')                   // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')       // [links](url) → texto
    .replace(/^[-*+]\s+/gm, '• ')                  // - bullet → • bullet
    .replace(/\n{3,}/g, '\n\n')                    // múltiplas linhas em branco → dupla
    .trim()
}

// Quebra texto em chunks curtos e naturais
export function splitIntoChunks(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const cleaned = stripMarkdown(text)
  const paragraphs = cleaned.split(/\n{1,}/).map(p => p.trim()).filter(Boolean)
  const chunks: string[] = []

  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      chunks.push(para)
      continue
    }

    const sentences = para.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [para]
    let current = ''

    for (const s of sentences) {
      const trimmed = s.trim()
      if (!trimmed) continue

      if (current && (current + ' ' + trimmed).length > maxChars) {
        chunks.push(current.trim())
        current = trimmed
      } else {
        current = current ? current + ' ' + trimmed : trimmed
      }
    }

    if (current.trim()) chunks.push(current.trim())
  }

  return chunks.filter(Boolean)
}

// Delay proporcional ao tamanho do chunk (simula digitação humana)
export function calcTypingDelay(text: string, minMs = 1000, maxMs = 3500): number {
  return Math.min(maxMs, Math.max(minMs, text.length * 28))
}
