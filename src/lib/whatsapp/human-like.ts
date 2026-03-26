import { sendText, sendPresence, type EvolutionConfig } from '@/lib/evolution'
import { splitIntoChunks, calcTypingDelay } from '@/lib/utils/split-chunks'

export { splitIntoChunks }

// Envia mensagem com comportamento humano:
// typing indicator → delay → mensagem (repete para cada chunk)
export async function sendHumanLike(
  cfg: EvolutionConfig,
  to: string,
  text: string,
): Promise<void> {
  const chunks = splitIntoChunks(text)

  if (chunks.length === 0) {
    await sendText(cfg, to, text)
    return
  }

  for (const chunk of chunks) {
    const delay = calcTypingDelay(chunk, 1200, 4500)
    await sendPresence(cfg, to, delay)
    await new Promise(resolve => setTimeout(resolve, delay))
    await sendText(cfg, to, chunk)
  }
}
