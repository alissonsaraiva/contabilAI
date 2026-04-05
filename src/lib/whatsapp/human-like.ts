import { sendText, sendPresence, type EvolutionConfig, type SendResult } from '@/lib/evolution'
import { splitIntoChunks, calcTypingDelay } from '@/lib/utils/split-chunks'

export { splitIntoChunks }

// Envia mensagem com comportamento humano:
// typing indicator → delay → mensagem (repete para cada chunk)
// Retorna resultado do envio (ok ou falha com detalhes)
export async function sendHumanLike(
  cfg: EvolutionConfig,
  to: string,
  text: string,
): Promise<SendResult> {
  const chunks = splitIntoChunks(text)

  if (chunks.length === 0) {
    // texto vazio ou somente espaços — não envia mensagem vazia para o WA
    return { ok: false, error: 'Texto vazio — nada a enviar', attempts: 0 }
  }

  for (const chunk of chunks) {
    const delay = calcTypingDelay(chunk, 1200, 4500)
    await sendPresence(cfg, to, delay)
    await new Promise(resolve => setTimeout(resolve, delay))
    const result = await sendText(cfg, to, chunk)
    if (!result.ok) return result // fail-fast no primeiro chunk com falha
  }

  return { ok: true }
}
