import { sendText, sendPresence, type EvolutionConfig, type WhatsAppKey } from '@/lib/evolution'
import { splitIntoChunks, calcTypingDelay } from '@/lib/utils/split-chunks'

export { splitIntoChunks }

export type HumanLikeResult =
  | { ok: true; keys: WhatsAppKey[] }
  | { ok: false; error: string; attempts: number }

// Envia mensagem com comportamento humano:
// typing indicator → delay → mensagem (repete para cada chunk)
// Retorna resultado do envio com os keys de cada chunk (necessários para deletar no WA)
export async function sendHumanLike(
  cfg: EvolutionConfig,
  to: string,
  text: string,
): Promise<HumanLikeResult> {
  const chunks = splitIntoChunks(text)

  if (chunks.length === 0) {
    // texto vazio ou somente espaços — não envia mensagem vazia para o WA
    return { ok: false, error: 'Texto vazio — nada a enviar', attempts: 0 }
  }

  const keys: WhatsAppKey[] = []
  for (const chunk of chunks) {
    const delay = calcTypingDelay(chunk, 1200, 4500)
    await sendPresence(cfg, to, delay)
    await new Promise(resolve => setTimeout(resolve, delay))
    const result = await sendText(cfg, to, chunk)
    if (!result.ok) return result // fail-fast no primeiro chunk com falha
    if (result.key) keys.push(result.key)
  }

  return { ok: true, keys }
}

