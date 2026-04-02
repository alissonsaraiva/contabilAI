import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

// ─── Defaults ─────────────────────────────────────────────────────────────────

const SPEDY_CONFIG_DEFAULTS = {
  spedyApiKey:            null as string | null,
  spedyAmbiente:          'sandbox' as string | null,
  spedyIssAliquota:       null as unknown,
  spedyIssWithheld:       false as boolean | null,
  spedyFederalServiceCode: null as string | null,
  spedyCityServiceCode:   null as string | null,
  spedyTaxationType:      null as string | null,
  spedyEnviarAoAutorizar: true  as boolean | null,
  spedyEnviarCanalPadrao: 'whatsapp' as string | null,
  evolutionApiKey:        null as string | null,
  evolutionApiUrl:        null as string | null,
  evolutionInstance:      null as string | null,
}

// ─── Leitura de config (sem cache — API keys não devem ficar em memória) ──────

export async function getEscritorioSpedy() {
  const row = await prisma.escritorio.findFirst({
    select: {
      spedyApiKey:            true,
      spedyAmbiente:          true,
      spedyIssAliquota:       true,
      spedyIssWithheld:       true,
      spedyFederalServiceCode: true,
      spedyCityServiceCode:   true,
      spedyTaxationType:      true,
      spedyEnviarAoAutorizar: true,
      spedyEnviarCanalPadrao: true,
      evolutionApiKey:        true,
      evolutionApiUrl:        true,
      evolutionInstance:      true,
    },
  })
  return row ?? SPEDY_CONFIG_DEFAULTS
}

/** Monta a URL do webhook usando hash SHA-256 da API key como token de segurança no path. */
export function montarWebhookUrl(spedyApiKey: string): string {
  const raw   = isEncrypted(spedyApiKey) ? decrypt(spedyApiKey) : spedyApiKey
  const token = createHash('sha256').update(raw).digest('hex').slice(0, 32)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://app.avos.com.br'
  return `${baseUrl}/api/webhooks/spedy/${token}`
}
