/**
 * GET /api/rag/avaliar?q=<query>&clienteId=<id>&canal=<canal>
 *
 * Pipeline de avaliação de qualidade do RAG (ponto 25 — admin only).
 *
 * Retorna side-by-side:
 *   - busca semântica (searchSimilar)
 *   - busca híbrida (searchHybrid: semântica + BM25 via RRF)
 *
 * Permite comparar qualidade de retrieval para uma query específica:
 *   - Quantos chunks cada método retorna
 *   - Similarity score de cada resultado
 *   - Se os resultados se sobrepõem
 *   - Quais chunks a busca híbrida encontra a mais (vantagem do BM25)
 *
 * Uso:
 *   GET /api/rag/avaliar?q=prazo DAS MEI&canal=crm
 *   GET /api/rag/avaliar?q=CNPJ 12345678&clienteId=abc&canal=portal
 */

import { NextResponse }                          from 'next/server'
import { auth }                                   from '@/lib/auth'
import { embedText, searchSimilar, searchHybrid } from '@/lib/rag'
import { getAiConfig }                            from '@/lib/ai/config'
import type { CanalRAG }                          from '@/lib/rag/types'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  // Restrito a admins e contadores — não expor para clientes
  const tipo = (session.user as { tipo?: string }).tipo
  if (tipo !== 'admin' && tipo !== 'contador') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const url       = new URL(req.url)
  const query     = url.searchParams.get('q')?.trim()
  const clienteId = url.searchParams.get('clienteId') ?? undefined
  const canal     = (url.searchParams.get('canal') ?? 'geral') as CanalRAG
  const limite    = Math.min(parseInt(url.searchParams.get('limite') ?? '10'), 20)

  if (!query) {
    return NextResponse.json({ error: 'Parâmetro q é obrigatório' }, { status: 400 })
  }

  const config = await getAiConfig()
  if (!config.openaiApiKey && !config.voyageApiKey) {
    return NextResponse.json({ error: 'Nenhuma chave de embedding configurada' }, { status: 503 })
  }

  const inicio = Date.now()
  let embedding: number[]
  try {
    embedding = await embedText(query, { openai: config.openaiApiKey, voyage: config.voyageApiKey })
  } catch (err) {
    return NextResponse.json({ error: 'Falha ao gerar embedding', detalhe: (err as Error).message }, { status: 503 })
  }
  const msEmbedding = Date.now() - inicio

  const searchOpts = {
    canal,
    clienteId,
    incluirGlobal: !!clienteId,
    limit: limite,
    minSimilarity: 0.4,  // threshold baixo — queremos ver TODOS os resultados para avaliar
  }

  // ─── Executa os dois métodos em paralelo ──────────────────────────────────
  const [semantico, hibrido] = await Promise.allSettled([
    searchSimilar(embedding, searchOpts),
    searchHybrid(embedding, query, searchOpts),
  ])

  const resultadoSemantico = semantico.status === 'fulfilled' ? semantico.value : []
  const resultadoHibrido   = hibrido.status   === 'fulfilled' ? hibrido.value   : []
  const msTotal            = Date.now() - inicio

  // ─── Análise de sobreposição ───────────────────────────────────────────────
  const idsSemantico = new Set(resultadoSemantico.map(r => r.id))
  const idsHibrido   = new Set(resultadoHibrido.map(r => r.id))

  const soAparecemNoSemantico = resultadoSemantico.filter(r => !idsHibrido.has(r.id)).map(r => r.id)
  const soAparecemNoHibrido   = resultadoHibrido.filter(r => !idsSemantico.has(r.id)).map(r => r.id)
  const emAmbos               = resultadoSemantico.filter(r => idsHibrido.has(r.id)).map(r => r.id)

  return NextResponse.json({
    query,
    canal,
    clienteId:       clienteId ?? null,
    performanceMs: {
      embedding: msEmbedding,
      total:     msTotal,
    },
    semantico: {
      total:      resultadoSemantico.length,
      resultados: resultadoSemantico.map(r => ({
        id:         r.id,
        tipo:       r.tipo,
        titulo:     r.titulo,
        similarity: Math.round(r.similarity * 1000) / 1000,
        preview:    r.conteudo.slice(0, 150),
        escopo:     r.escopo,
      })),
    },
    hibrido: {
      total:      resultadoHibrido.length,
      resultados: resultadoHibrido.map(r => ({
        id:         r.id,
        tipo:       r.tipo,
        titulo:     r.titulo,
        similarity: Math.round(r.similarity * 1000) / 1000,
        preview:    r.conteudo.slice(0, 150),
        escopo:     r.escopo,
      })),
    },
    analise: {
      totalUnicos:              new Set([...idsSemantico, ...idsHibrido]).size,
      sobreposicao:             emAmbos.length,
      exclusivosSemantico:      soAparecemNoSemantico.length,
      exclusivosHibrido:        soAparecemNoHibrido.length,
      ganhoHibrido:             soAparecemNoHibrido.length,  // chunks que só BM25 encontrou
      recomendacao:             soAparecemNoHibrido.length > 0
        ? `Hybrid search encontrou ${soAparecemNoHibrido.length} chunk(s) extra(s) via keyword — recomendado para esta query.`
        : 'Ambos os métodos retornam resultados equivalentes para esta query.',
    },
  })
}
