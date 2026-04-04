/**
 * GET /api/crm/notas-fiscais/municipios — proxy para Spedy /service-invoices/cities
 * Cache de 24h para não sobrecarregar a API da Spedy
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSpedyOwnerClient } from '@/lib/spedy'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { logger } from '@/lib/logger'

// Cache simples em memória — reset a cada deploy
const _cache = new Map<string, { data: unknown; expiresAt: number }>()

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const codigoIbge = searchParams.get('codigoIbge')
  const estado     = searchParams.get('estado')
  const page       = searchParams.get('page') ?? '1'
  const pageSize   = searchParams.get('pageSize') ?? '50'

  const cacheKey = `municipios:${codigoIbge}:${estado}:${page}:${pageSize}`
  const cached = _cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data)
  }

  try {
    const escritorio = await prisma.escritorio.findFirst({
      select: { spedyApiKey: true, spedyAmbiente: true },
    })

    if (!escritorio?.spedyApiKey) {
      return NextResponse.json({ error: 'Spedy não configurado' }, { status: 422 })
    }

    const client = getSpedyOwnerClient({
      spedyApiKey:    escritorio.spedyApiKey,
      spedyAmbiente:  escritorio.spedyAmbiente,
    })

    const resultado = await client.listarMunicipios({
      code:     codigoIbge ?? undefined,
      state:    estado     ?? undefined,
      page:     parseInt(page),
      pageSize: Math.min(parseInt(pageSize), 100), // Spedy limita a 100 por página
    })

    _cache.set(cacheKey, { data: resultado, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
    return NextResponse.json(resultado)
  } catch (err) {
    logger.error('api-crm-municipios-spedy', { err })
    return NextResponse.json({ error: 'Erro ao consultar municípios' }, { status: 500 })
  }
}
