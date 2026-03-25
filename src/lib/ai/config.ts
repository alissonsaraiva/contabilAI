import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'

export type AiConfig = {
  provider: string
  anthropicApiKey: string | null
  voyageApiKey: string | null
  openaiApiKey: string | null
  openaiBaseUrl: string | null
  openaiModel: string | null
  models: {
    onboarding: string
    crm: string
    portal: string
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
  let escritorio: Record<string, string | null> = {}

  try {
    const row = await prisma.escritorio.findFirst({
      select: {
        aiProvider: true,
        anthropicApiKey: true,
        voyageApiKey: true,
        openaiApiKey: true,
        openaiBaseUrl: true,
        openaiModel: true,
        aiModelOnboarding: true,
        aiModelCrm: true,
        aiModelPortal: true,
      },
    })
    if (row) escritorio = row as Record<string, string | null>
  } catch {
    // DB indisponível — usa apenas env vars
  }

  return {
    provider:
      escritorio.aiProvider ??
      process.env.AI_PROVIDER ??
      'claude',

    anthropicApiKey:
      safeDecrypt(escritorio.anthropicApiKey) ??
      process.env.ANTHROPIC_API_KEY ??
      null,

    voyageApiKey:
      safeDecrypt(escritorio.voyageApiKey) ??
      process.env.VOYAGE_API_KEY ??
      null,

    openaiApiKey:
      safeDecrypt(escritorio.openaiApiKey) ??
      process.env.OPENAI_API_KEY ??
      null,

    openaiBaseUrl:
      escritorio.openaiBaseUrl ??
      process.env.OPENAI_BASE_URL ??
      null,

    openaiModel:
      escritorio.openaiModel ??
      process.env.OPENAI_MODEL ??
      null,

    models: {
      onboarding: escritorio.aiModelOnboarding ?? 'claude-haiku-4-5-20251001',
      crm:        escritorio.aiModelCrm        ?? 'claude-haiku-4-5-20251001',
      portal:     escritorio.aiModelPortal     ?? 'claude-haiku-4-5-20251001',
    },
  }
}
