/**
 * GET  /api/crm/clientes/[id]/spedy — status da configuração Spedy do cliente
 * POST /api/crm/clientes/[id]/spedy — configura Spedy para o cliente
 *   body: { modo: 'sincronizar' | 'conectar', apiKey?: string }
 *   modo 'sincronizar' → cria ou atualiza empresa na Spedy via conta Owner
 *   modo 'conectar'    → recebe apiKey própria do cliente e salva
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { getSpedyOwnerClient } from '@/lib/spedy'
import { sincronizarEmpresaNaSpedy } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'

// Cache em memória por estado (UF) — mesma estratégia do route de municípios
const _municipioCache = new Map<string, { nomes: Set<string>; expiresAt: number }>()

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/** Busca código IBGE do CEP via ViaCEP. Retorna null se falhar. */
async function ibgeDoCep(cep: string): Promise<string | null> {
  try {
    const cleaned = cep.replace(/\D/g, '')
    if (cleaned.length !== 8) return null
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 4_000)
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`, { signal: controller.signal })
      if (!res.ok) return null
      const data = await res.json() as { ibge?: string; erro?: boolean }
      if (data.erro) return null
      return data.ibge ?? null
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return null
  }
}

async function verificarMunicipioCoberto(
  cidade: string,
  uf: string,
  cep: string | null,
  spedyApiKey: string,
  spedyAmbiente: string | null,
): Promise<boolean> {
  const client = getSpedyOwnerClient({ spedyApiKey, spedyAmbiente })

  // Estratégia 1: IBGE code via ViaCEP — match exato, sem normalização
  if (cep) {
    const ibge = await ibgeDoCep(cep)
    if (ibge) {
      const result = await client.verificarMunicipio(ibge)
      return result !== null
    }
  }

  // Estratégia 2: fallback por nome normalizado (paginado, com cache 24h)
  const ufUpper = uf.toUpperCase()
  const cached = _municipioCache.get(ufUpper)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.nomes.has(normalizar(cidade))
  }

  const nomes = new Set<string>()
  let page = 1, hasNext = true
  while (hasNext) {
    const res = await client.listarMunicipios({ state: ufUpper, page, pageSize: 100 })
    res.items.forEach(m => nomes.add(normalizar(m.name)))
    hasNext = res.hasNext
    page++
  }
  _municipioCache.set(ufUpper, { nomes, expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
  return nomes.has(normalizar(cidade))
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where:   { id },
    select:  { nome: true, empresaId: true, cidade: true, uf: true, cep: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  if (!cliente.empresaId) return NextResponse.json({ configurado: false, motivo: 'Cliente sem empresa vinculada' })

  const [empresa, escritorio] = await Promise.all([
    prisma.empresa.findUnique({
      where:  { id: cliente.empresaId },
      select: {
        spedyConfigurado:        true,
        spedyConfiguradoEm:      true,
        spedyCompanyId:          true,
        spedyFederalServiceCode: true,
        spedyCityServiceCode:    true,
        spedyIssAliquota:        true,
        spedyIssWithheld:        true,
        spedyTaxationType:       true,
      },
    }),
    prisma.escritorio.findFirst({
      select: { spedyApiKey: true, spedyAmbiente: true },
    }),
  ])

  // Verifica cobertura do município na Spedy (null = cidade/UF não cadastrados)
  let municipioIntegrado: boolean | null = null
  if (escritorio?.spedyApiKey && cliente.cidade && cliente.uf) {
    try {
      municipioIntegrado = await verificarMunicipioCoberto(
        cliente.cidade,
        cliente.uf,
        cliente.cep ?? null,
        escritorio.spedyApiKey,
        escritorio.spedyAmbiente ?? null,
      )
    } catch (err) {
      logger.warn('api-spedy-municipio-check-falhou', { clienteId: id, err })
    }
  }

  return NextResponse.json({
    configurado:        empresa?.spedyConfigurado ?? false,
    configuradoEm:      empresa?.spedyConfiguradoEm,
    temCompanyId:       !!empresa?.spedyCompanyId,
    municipioIntegrado,
    municipioNome:      cliente.cidade ?? null,
    fiscalDefaults: {
      federalServiceCode: empresa?.spedyFederalServiceCode,
      cityServiceCode:    empresa?.spedyCityServiceCode,
      issAliquota:        empresa?.spedyIssAliquota,
      issWithheld:        empresa?.spedyIssWithheld,
      taxationType:       empresa?.spedyTaxationType,
    },
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { modo: 'sincronizar' | 'criar' | 'conectar'; apiKey?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const cliente = await prisma.cliente.findUnique({
    where:   { id },
    include: { empresa: true },
  })
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  if (!cliente.empresa) return NextResponse.json({ error: 'Cliente sem empresa vinculada' }, { status: 422 })

  const empresa = cliente.empresa

  // Modo 1: conectar chave própria do cliente
  if (body.modo === 'conectar') {
    if (!body.apiKey?.trim()) {
      return NextResponse.json({ error: 'apiKey obrigatória no modo conectar' }, { status: 400 })
    }

    const apiKeyEncrypted = encrypt(body.apiKey.trim())
    await prisma.empresa.update({
      where: { id: empresa.id },
      data:  { spedyApiKey: apiKeyEncrypted, spedyConfigurado: true, spedyConfiguradoEm: new Date() },
    })
    return NextResponse.json({ sucesso: true, modo: 'conectar' })
  }

  // Modo 2: criar ou atualizar empresa via conta Owner (sincronizar = criar + atualizar)
  if (body.modo === 'sincronizar' || body.modo === 'criar') {
    try {
      const resultado = await sincronizarEmpresaNaSpedy(empresa.id)
      if (!resultado.sucesso) {
        return NextResponse.json({ error: resultado.detalhe ?? 'Falha na sincronização' }, { status: 422 })
      }
      return NextResponse.json({ sucesso: true, acao: resultado.acao })
    } catch (err) {
      logger.error('api-spedy-sincronizar-empresa', { clienteId: id, err })
      Sentry.captureException(err, { tags: { module: 'crm-spedy', operation: 'sincronizar-empresa' }, extra: { clienteId: id } })
      const msg = err instanceof Error ? err.message : 'Erro ao sincronizar empresa na Spedy'
      return NextResponse.json({ error: msg }, { status: 422 })
    }
  }

  return NextResponse.json({ error: 'Modo inválido. Use: sincronizar ou conectar' }, { status: 400 })
}
