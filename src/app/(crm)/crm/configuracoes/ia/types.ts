export type Model = { value: string; label: string }
export type ApiStatus = { configured: boolean; masked: string | null }
export type ProviderModels = { models: Model[]; configured: boolean; dynamic: boolean }
export type AllModels = { claude: ProviderModels; openai: ProviderModels; google: ProviderModels }
export type TestResult = { ok: boolean; label?: string; error?: string }
export type TestResults = { anthropic: TestResult; voyage: TestResult; groq: TestResult; openai: TestResult; google: TestResult }

export type FormData = {
  nomeAssistenteOnboarding: string
  nomeAssistenteCrm: string
  nomeAssistentePortal: string
  nomeAssistenteWhatsapp: string
  anthropicApiKey: string
  voyageApiKey: string
  openaiApiKey: string
  openaiBaseUrl: string
  googleApiKey: string
  groqApiKey: string
  aiProviderOnboarding: string
  aiProviderCrm: string
  aiProviderPortal: string
  aiProviderWhatsapp: string
  aiProviderAgente: string
  aiProviderDocumentoResumo: string
  aiModelOnboarding: string
  aiModelCrm: string
  aiModelPortal: string
  aiModelWhatsapp: string
  aiModelAgente: string
  aiModelDocumentoResumo: string
  systemPromptOnboarding: string
  systemPromptCrm: string
  systemPromptPortal: string
}

export type ProviderKey = 'claude' | 'openai' | 'google'

export type SubIaConfig = {
  providerField: keyof FormData
  modelField: keyof FormData
  promptField: keyof FormData | null
  nameField: keyof FormData | null
  label: string
  icon: string
  desc: string
  note: string | null
}
