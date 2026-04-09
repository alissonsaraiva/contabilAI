/**
 * Stage 2 do pipeline webhook WhatsApp:
 * Carrega configuração do escritório e valida apikey da Evolution.
 *
 * Responsabilidades:
 *   - Buscar config (evolutionApiUrl, apiKey, instance, AI flags, groqApiKey)
 *   - Descriptografar chaves quando necessário
 *   - Validar apikey da Evolution contra o header da requisição
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import type { EvolutionConfig } from '@/lib/evolution'
import type { ConfigResult } from './types'

/**
 * Carrega config do escritório e valida a apikey da Evolution.
 * Retorna `{ ok: false }` se não há config ou apikey inválida.
 */
export async function carregarConfig(req: Request): Promise<ConfigResult> {
  let cfg: EvolutionConfig | null = null
  let aiEnabled = false
  let groqApiKey: string | null = null

  try {
    const row = await prisma.escritorio.findFirst({
      select: {
        evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true,
        whatsappAiEnabled: true,
        groqApiKey: true,
      },
    })
    if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
      const rawKey = row.evolutionApiKey
      cfg = {
        baseUrl: row.evolutionApiUrl,
        apiKey: rawKey ? (isEncrypted(rawKey) ? decrypt(rawKey) : rawKey) : (process.env.EVOLUTION_API_KEY ?? ''),
        instance: row.evolutionInstance,
      }
    }
    aiEnabled = row?.whatsappAiEnabled ?? false
    groqApiKey = row?.groqApiKey ? (isEncrypted(row.groqApiKey as string) ? decrypt(row.groqApiKey as string) : row.groqApiKey as string) : null
  } catch (err) {
    console.error('[whatsapp/webhook] erro ao carregar config do escritório:', err)
    Sentry.captureException(err, {
      tags: { module: 'whatsapp-webhook', operation: 'carregar-config' },
    })
  }

  if (!cfg) return { ok: false, response: 'no config', status: 200 }

  // Valida apikey da Evolution contra o header da requisição
  const headerApiKey = req.headers.get('apikey')
  if (cfg.apiKey && headerApiKey !== cfg.apiKey) {
    console.warn('[whatsapp/webhook] apikey inválida recebida:', headerApiKey?.slice(0, 8))
    Sentry.captureMessage('Webhook WhatsApp rejeitado: apikey da Evolution inválida', {
      level: 'warning',
      tags:  { module: 'whatsapp-webhook', operation: 'auth-evolution' },
      extra: { receivedPrefix: headerApiKey?.slice(0, 6) ?? 'ausente' },
    })
    return { ok: false, response: 'unauthorized', status: 401 }
  }

  return { ok: true, cfg, aiEnabled, groqApiKey }
}
