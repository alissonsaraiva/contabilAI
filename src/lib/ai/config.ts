import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

// ─── Cache em memória com TTL ─────────────────────────────────────────────────
// Evita hit no banco a cada requisição de IA (pode ser centenas por minuto).
// Invalidado explicitamente quando o admin salva a config.

const CONFIG_TTL_MS = 60_000  // 60 segundos

declare global {
  // eslint-disable-next-line no-var
  var __aiConfigCache: { config: AiConfig; expiresAt: number } | undefined
}

export function invalidateAiConfigCache(): void {
  global.__aiConfigCache = undefined
}

export type AiConfig = {
  nomeAssistentes: {
    onboarding: string | null
    crm: string | null
    portal: string | null
    whatsapp: string | null
  }
  provider: string
  anthropicApiKey: string | null
  voyageApiKey: string | null
  openaiApiKey: string | null
  openaiBaseUrl: string | null
  openaiModel: string | null
  googleApiKey: string | null
  groqApiKey: string | null
  models: {
    onboarding: string
    crm: string
    portal: string
    whatsapp: string
    agente: string
  }
  providers: {
    onboarding: string
    crm: string
    portal: string
    whatsapp: string
    agente: string
  }
  systemPrompts: {
    onboarding: string | null
    crm: string | null
    portal: string | null
    whatsapp: string | null
  }
  whatsapp: {
    aiEnabled: boolean
    aiFeature: string
    instanceId: string | null
    token: string | null
  }
}

function safeDecrypt(val: string | null | undefined): string | null {
  if (!val) return null
  try {
    return isEncrypted(val) ? decrypt(val) : val
  } catch {
    return null
  }
}

// Lê configuração de IA — DB tem prioridade sobre env vars
export async function getAiConfig(): Promise<AiConfig> {
  // Retorna do cache se ainda válido
  if (global.__aiConfigCache && Date.now() < global.__aiConfigCache.expiresAt) {
    return global.__aiConfigCache.config
  }

  let row: Record<string, unknown> = {}

  try {
    const fetched = await prisma.escritorio.findFirst({
      select: {
        nomeAssistenteOnboarding: true,
        nomeAssistenteCrm: true,
        nomeAssistentePortal: true,
        nomeAssistenteWhatsapp: true,
        aiProvider: true,
        anthropicApiKey: true,
        voyageApiKey: true,
        openaiApiKey: true,
        openaiBaseUrl: true,
        openaiModel: true,
        googleApiKey: true,
        groqApiKey: true,
        aiModelOnboarding: true,
        aiModelCrm: true,
        aiModelPortal: true,
        aiModelWhatsapp: true,
        aiModelAgente: true,
        aiProviderOnboarding: true,
        aiProviderCrm: true,
        aiProviderPortal: true,
        aiProviderWhatsapp: true,
        aiProviderAgente: true,
        systemPromptOnboarding: true,
        systemPromptCrm: true,
        systemPromptPortal: true,
        systemPromptWhatsapp: true,
        whatsappAiEnabled: true,
        whatsappAiFeature: true,
        evolutionApiUrl: true,
        evolutionApiKey: true,
        evolutionInstance: true,
        zapiInstanceId: true,
        zapiToken: true,
      },
    })
    if (fetched) row = fetched as Record<string, unknown>
  } catch {
    // DB indisponível — usa apenas env vars
  }

  const s = (k: string) => { const v = row[k] as string | null | undefined; return v || null }

  const defaultModelForProvider = (provider: string | null, openaiModel: string | null): string => {
    switch (provider) {
      case 'google': return 'gemini-2.5-flash'
      case 'groq':   return 'llama-3.1-8b-instant'
      case 'openai': return openaiModel ?? 'gpt-4o-mini'
      default:       return 'claude-haiku-4-5-20251001'
    }
  }

  // Usa o modelo salvo, mas ignora nomes Claude quando o provider não é Anthropic
  const resolveModel = (stored: string | null, provider: string, openaiModel: string | null): string => {
    if (!stored || (stored.startsWith('claude-') && provider !== 'claude')) {
      return defaultModelForProvider(provider, openaiModel)
    }
    return stored
  }

  const globalProvider = s('aiProvider') ?? process.env.AI_PROVIDER ?? 'claude'
  const openaiModel    = s('openaiModel') ?? process.env.OPENAI_MODEL ?? null

  const providerOnboarding = s('aiProviderOnboarding') ?? globalProvider
  const providerCrm        = s('aiProviderCrm')        ?? globalProvider
  const providerPortal     = s('aiProviderPortal')     ?? globalProvider
  const providerWhatsapp   = s('aiProviderWhatsapp')   ?? globalProvider
  // Agente sempre usa Claude (tool use nativo) — fallback para o provider global se configurado
  const providerAgente     = s('aiProviderAgente')     ?? 'claude'

  const config: AiConfig = {
    nomeAssistentes: {
      onboarding: s('nomeAssistenteOnboarding'),
      crm:        s('nomeAssistenteCrm'),
      portal:     s('nomeAssistentePortal'),
      whatsapp:   s('nomeAssistenteWhatsapp'),
    },
    provider: globalProvider,

    anthropicApiKey: safeDecrypt(s('anthropicApiKey')) ?? process.env.ANTHROPIC_API_KEY ?? null,
    voyageApiKey:    safeDecrypt(s('voyageApiKey'))    ?? process.env.VOYAGE_API_KEY    ?? null,
    openaiApiKey:    safeDecrypt(s('openaiApiKey'))    ?? process.env.OPENAI_API_KEY    ?? null,
    openaiBaseUrl:   s('openaiBaseUrl')  ?? process.env.OPENAI_BASE_URL  ?? null,
    openaiModel,
    googleApiKey:    safeDecrypt(s('googleApiKey'))   ?? process.env.GOOGLE_API_KEY   ?? null,
    groqApiKey:      safeDecrypt(s('groqApiKey'))     ?? process.env.GROQ_API_KEY     ?? null,

    models: {
      onboarding: resolveModel(s('aiModelOnboarding'), providerOnboarding, openaiModel),
      crm:        resolveModel(s('aiModelCrm'),        providerCrm,        openaiModel),
      portal:     resolveModel(s('aiModelPortal'),     providerPortal,     openaiModel),
      whatsapp:   resolveModel(s('aiModelWhatsapp'),   providerWhatsapp,   openaiModel),
      agente:     resolveModel(s('aiModelAgente'),     providerAgente,     openaiModel),
    },

    providers: {
      onboarding: providerOnboarding,
      crm:        providerCrm,
      portal:     providerPortal,
      whatsapp:   providerWhatsapp,
      agente:     providerAgente,
    },

    systemPrompts: {
      onboarding: s('systemPromptOnboarding'),
      crm:        s('systemPromptCrm'),
      portal:     s('systemPromptPortal'),
      whatsapp:   s('systemPromptWhatsapp'),
    },

    whatsapp: {
      aiEnabled:  (row['whatsappAiEnabled'] as boolean | null) ?? false,
      aiFeature:  s('whatsappAiFeature') ?? 'onboarding',
      instanceId: s('evolutionInstance') ?? process.env.EVOLUTION_INSTANCE ?? null,
      token:      safeDecrypt(s('evolutionApiKey')) ?? process.env.EVOLUTION_API_KEY ?? null,
    },
  }

  // Armazena no cache antes de retornar
  global.__aiConfigCache = { config, expiresAt: Date.now() + CONFIG_TTL_MS }
  return config
}
