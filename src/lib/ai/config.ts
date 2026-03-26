import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

export type AiConfig = {
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
  }
  providers: {
    onboarding: string
    crm: string
    portal: string
    whatsapp: string
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
  let row: Record<string, unknown> = {}

  try {
    const fetched = await prisma.escritorio.findFirst({
      select: {
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
        aiProviderOnboarding: true,
        aiProviderCrm: true,
        aiProviderPortal: true,
        aiProviderWhatsapp: true,
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

  const s = (k: string) => (row[k] as string | null | undefined) ?? null

  return {
    provider: s('aiProvider') ?? process.env.AI_PROVIDER ?? 'claude',

    anthropicApiKey: safeDecrypt(s('anthropicApiKey')) ?? process.env.ANTHROPIC_API_KEY ?? null,
    voyageApiKey:    safeDecrypt(s('voyageApiKey'))    ?? process.env.VOYAGE_API_KEY    ?? null,
    openaiApiKey:    safeDecrypt(s('openaiApiKey'))    ?? process.env.OPENAI_API_KEY    ?? null,
    openaiBaseUrl:   s('openaiBaseUrl')  ?? process.env.OPENAI_BASE_URL  ?? null,
    openaiModel:     s('openaiModel')    ?? process.env.OPENAI_MODEL     ?? null,
    googleApiKey:    safeDecrypt(s('googleApiKey'))   ?? process.env.GOOGLE_API_KEY   ?? null,
    groqApiKey:      safeDecrypt(s('groqApiKey'))     ?? process.env.GROQ_API_KEY     ?? null,

    models: {
      onboarding: s('aiModelOnboarding') ?? 'claude-haiku-4-5-20251001',
      crm:        s('aiModelCrm')        ?? 'claude-haiku-4-5-20251001',
      portal:     s('aiModelPortal')     ?? 'claude-haiku-4-5-20251001',
      whatsapp:   s('aiModelWhatsapp')   ?? 'claude-haiku-4-5-20251001',
    },

    providers: {
      onboarding: s('aiProviderOnboarding') ?? s('aiProvider') ?? 'claude',
      crm:        s('aiProviderCrm')        ?? s('aiProvider') ?? 'claude',
      portal:     s('aiProviderPortal')     ?? s('aiProvider') ?? 'claude',
      whatsapp:   s('aiProviderWhatsapp')   ?? s('aiProvider') ?? 'claude',
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
}
