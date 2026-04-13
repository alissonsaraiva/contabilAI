// Utilitário compartilhado — sem dependências de servidor
// Usado pelo WhatsApp (human-like.ts) e pelo chat widget do onboarding

// Guardrail: parágrafo acima desse limite é dividido por \n simples como fallback
const MAX_CHUNK_CHARS = 4000

// Remove formatação markdown que não fica bem em chats
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')                // code blocks (antes dos outros)
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')          // **bold** → bold
    .replace(/\*([\s\S]+?)\*/g, '$1')              // *italic* → italic
    .replace(/__([\s\S]+?)__/g, '$1')              // __bold__ → bold
    .replace(/_([\s\S]+?)_/g, '$1')               // _italic_ → italic
    .replace(/^#{1,6}\s+/gm, '')                   // # headers
    .replace(/---+/g, '')                          // --- separadores (inline ou linha)
    .replace(/`([^`]+)`/g, '$1')                   // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')       // [links](url) → texto
    .replace(/^[-*+]\s+/gm, '• ')                  // - bullet → • bullet
    .replace(/\n{3,}/g, '\n\n')                    // múltiplas linhas em branco → dupla
    .trim()
}

// Divide por parágrafos (\n\n) preservando cada um como mensagem inteira.
// Sem quebra artificial de sentença — o texto da IA chega íntegro ao cliente.
// Guardrail: parágrafo > MAX_CHUNK_CHARS é subdividido por \n simples.
export function splitIntoChunks(text: string): string[] {
  const cleaned = stripMarkdown(text)
  const chunks: string[] = []

  for (const para of cleaned.split(/\n\n+/).map(p => p.trim()).filter(Boolean)) {
    if (para.length <= MAX_CHUNK_CHARS) {
      chunks.push(para)
    } else {
      // parágrafo anormalmente longo (>4000 chars) — divide por \n simples
      for (const line of para.split(/\n/).map(l => l.trim()).filter(Boolean)) {
        chunks.push(line)
      }
    }
  }

  return chunks
}

// Delay proporcional ao tamanho do chunk (simula digitação humana)
export function calcTypingDelay(text: string, minMs = 1000, maxMs = 3500): number {
  return Math.min(maxMs, Math.max(minMs, text.length * 28))
}
