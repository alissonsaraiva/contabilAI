/**
 * GET /api/cnpj/:cnpj
 *
 * Proxy público para consulta de CNPJ via BrasilAPI.
 * Não requer autenticação — dados são públicos da Receita Federal.
 * Cache: 24h via Cache-Control (CDN/proxy) + cache in-process para requests simultâneos.
 *
 * Usado pelo hook useCnpj() e por qualquer tela que precise auto-preencher
 * dados de empresa a partir do CNPJ.
 */

import { NextResponse } from 'next/server'
import { consultarCNPJ } from '@/lib/cnpj'

// Cache in-process: evita bater na BrasilAPI várias vezes para o mesmo CNPJ
// num curto intervalo (ex: múltiplas instâncias do hook renderizando ao mesmo tempo).
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 horas

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ cnpj: string }> }
) {
  const { cnpj } = await params
  const digits = cnpj.replace(/\D/g, '')

  if (digits.length !== 14) {
    return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
  }

  // Retorna do cache in-process se ainda válido
  const cached = cache.get(digits)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
    })
  }

  try {
    const dados = await consultarCNPJ(digits)
    cache.set(digits, { data: dados, expiresAt: Date.now() + CACHE_TTL_MS })
    // Limpa entradas expiradas periodicamente (evita crescimento ilimitado)
    if (cache.size > 1000) {
      const now = Date.now()
      for (const [key, val] of cache) {
        if (now > val.expiresAt) cache.delete(key)
      }
    }
    return NextResponse.json(dados, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' },
    })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('não encontrado') ? 404 : 502
    return NextResponse.json({ error: msg }, { status })
  }
}
