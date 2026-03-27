import { NextResponse } from 'next/server'
import { getAiConfig } from '@/lib/ai/config'

// Configurações públicas do onboarding — sem dados sensíveis
export async function GET() {
  const config = await getAiConfig()
  return NextResponse.json({
    nomeIa: config.nomeAssistentes.onboarding ?? 'Assistente',
  })
}
