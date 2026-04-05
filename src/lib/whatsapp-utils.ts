/**
 * Utilitários compartilhados pelas rotas de envio de WhatsApp
 * (clientes, leads, socios).
 */

import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import type { EvolutionConfig } from '@/lib/evolution'

// Domínio de storage confiável — mesma var do .env.example
const STORAGE_TRUSTED_HOST: string | null = (() => {
  try {
    return process.env.STORAGE_PUBLIC_URL
      ? new URL(process.env.STORAGE_PUBLIC_URL).hostname
      : null
  } catch {
    return null
  }
})()

/** MIME types aceitos em anexos de WhatsApp */
export const WHATSAPP_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
])

/**
 * Valida e formata um número de telefone para o formato JID do WhatsApp.
 * Aceita 8–13 dígitos após limpeza de caracteres não numéricos.
 * Retorna null se o número for inválido.
 */
export function buildRemoteJid(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 13) return null
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

/**
 * Verifica que uma URL de mídia pertence ao domínio de storage confiável.
 * Previne SSRF caso um atacante passe uma URL arbitrária.
 */
export function isMediaUrlTrusted(url: string): boolean {
  if (!STORAGE_TRUSTED_HOST) return true  // variável não configurada — modo permissivo
  try {
    return new URL(url).hostname === STORAGE_TRUSTED_HOST
  } catch {
    return false
  }
}

/** Lê a configuração da Evolution API do banco */
export async function getEvolutionConfig(): Promise<EvolutionConfig | null> {
  const row = await prisma.escritorio.findFirst({
    select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
  })
  if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) return null
  const rawKey = row.evolutionApiKey
  return {
    baseUrl:  row.evolutionApiUrl,
    apiKey:   rawKey ? (isEncrypted(rawKey) ? decrypt(rawKey) : rawKey) : (process.env.EVOLUTION_API_KEY ?? ''),
    instance: row.evolutionInstance,
  }
}

// ---------------------------------------------------------------------------
// Rate limiter em memória por userId — max 30 mensagens por 60 s por worker.
// Em produção com múltiplos workers (PM2 cluster) migrar para Redis.
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000

export function checkRateLimit(userId: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { ok: true }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { ok: true }
}
