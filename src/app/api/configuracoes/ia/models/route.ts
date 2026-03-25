import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAiConfig } from '@/lib/ai/config'

// Modelos fixos por provider (fallback e base)
const CLAUDE_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — rápido e econômico' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 — melhor custo-benefício' },
  { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6 — mais capaz' },
]

const OPENAI_MODELS = [
  { value: 'gpt-4.1-nano',  label: 'GPT-4.1 Nano — ultra rápido e econômico' },
  { value: 'gpt-4.1-mini',  label: 'GPT-4.1 Mini — rápido e econômico' },
  { value: 'gpt-4.1',       label: 'GPT-4.1 — avançado' },
  { value: 'gpt-4o-mini',   label: 'GPT-4o Mini — econômico' },
  { value: 'gpt-4o',        label: 'GPT-4o — capaz' },
]

const GOOGLE_MODELS = [
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — ultra rápido e econômico' },
  { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash — rápido e econômico' },
  { value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash — equilibrado' },
  { value: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro — mais capaz' },
]

// Tenta buscar modelos dinamicamente da OpenAI (ou compatível)
async function fetchOpenAIModels(baseUrl: string, apiKey: string) {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/models`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json() as { data: { id: string; created: number }[] }
    const gpt = data.data
      .filter(m => m.id.startsWith('gpt-'))
      .sort((a, b) => b.created - a.created)
      .slice(0, 12)
      .map(m => ({ value: m.id, label: m.id }))
    return gpt.length > 0 ? gpt : null
  } catch {
    return null
  }
}

// Tenta buscar modelos do Google Gemini
async function fetchGoogleModels(apiKey: string) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const data = await res.json() as {
      models: { name: string; displayName: string; supportedGenerationMethods: string[] }[]
    }
    const gemini = data.models
      .filter(m =>
        m.name.includes('gemini') &&
        m.supportedGenerationMethods.includes('generateContent'),
      )
      .map(m => ({
        value: m.name.replace('models/', ''),
        label: m.displayName,
      }))
    return gemini.length > 0 ? gemini : null
  } catch {
    return null
  }
}

export async function GET() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const config = await getAiConfig()

  if (config.provider === 'claude') {
    return NextResponse.json({ provider: 'claude', models: CLAUDE_MODELS, dynamic: false })
  }

  if (config.provider === 'openai') {
    if (config.openaiApiKey) {
      const baseUrl = config.openaiBaseUrl ?? 'https://api.openai.com/v1'
      const dynamic = await fetchOpenAIModels(baseUrl, config.openaiApiKey)
      if (dynamic) return NextResponse.json({ provider: 'openai', models: dynamic, dynamic: true })
    }
    return NextResponse.json({ provider: 'openai', models: OPENAI_MODELS, dynamic: false })
  }

  if (config.provider === 'google') {
    if (config.googleApiKey) {
      const dynamic = await fetchGoogleModels(config.googleApiKey)
      if (dynamic) return NextResponse.json({ provider: 'google', models: dynamic, dynamic: true })
    }
    return NextResponse.json({ provider: 'google', models: GOOGLE_MODELS, dynamic: false })
  }

  return NextResponse.json({ provider: config.provider, models: [], dynamic: false })
}
