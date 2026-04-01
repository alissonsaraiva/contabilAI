/**
 * extrairConteudoDocumento — extrai conteúdo de um arquivo para uso pela IA
 * (classificação e geração de resumo).
 *
 * Estratégia por tipo:
 *   PDF          → pdf-parse (sem custo de LLM, retorna texto plano)
 *   XML          → stringify do xmlMetadata já parseado (ou parse do buffer)
 *   image/*      → base64 para Claude/OpenAI/Google Vision
 *   text/plain   → leitura direta do buffer ou fetch da URL
 *   text/csv     → leitura direta (limitada a 6k chars)
 *   outros       → null (não processável pela IA)
 *
 * NOTA: URLs do R2 (STORAGE_PUBLIC_URL) requerem URL assinada — resolverBuffer
 * gera automaticamente via getDownloadUrl antes de fazer fetch.
 */
import { getDownloadUrl } from '@/lib/storage'
import * as Sentry from '@sentry/nextjs'

export type ConteudoExtraido =
  | { tipo: 'texto';  texto: string }
  | { tipo: 'imagem'; base64: string; mimeType: string }
  | null

const MAX_TEXTO_CHARS  = 8_000  // limita para não explodir o contexto da IA
const MAX_CSV_CHARS    = 4_000
const MAX_IMAGE_BYTES  = 4 * 1024 * 1024  // 4 MB — APIs de visão rejeitam acima de ~5 MB

export type ExtrairConteudoInput = {
  mimeType:    string
  nome?:       string
  buffer?:     Buffer       // buffer do arquivo (prioritário)
  url?:        string       // URL pública para fetch (fallback)
  xmlMetadata?: unknown     // XML já parseado por parseXML()
}

export async function extrairConteudoDocumento(
  input: ExtrairConteudoInput,
): Promise<ConteudoExtraido> {
  const { mimeType, buffer, url, xmlMetadata } = input
  const mime = mimeType.toLowerCase()

  // ── XML — usa metadata já parseado ou extrai do buffer ───────────────────
  if (mime.includes('xml') || input.nome?.toLowerCase().endsWith('.xml')) {
    if (xmlMetadata) {
      const texto = formatarXmlMetadata(xmlMetadata)
      return texto ? { tipo: 'texto', texto } : null
    }
    const buf = await resolverBuffer(buffer, url)
    if (!buf) return null
    return { tipo: 'texto', texto: buf.toString('utf-8').slice(0, MAX_TEXTO_CHARS) }
  }

  // ── PDF — pdf-parse ────────────────────────────────────────────────────────
  if (mime.includes('pdf')) {
    const buf = await resolverBuffer(buffer, url)
    if (!buf) return null
    try {
      const pdfParse = (await import('pdf-parse')).default
      const result = await pdfParse(buf)
      const texto = result.text.trim().slice(0, MAX_TEXTO_CHARS)
      return texto ? { tipo: 'texto', texto } : null
    } catch (err) {
      console.warn('[extrairConteudo] falha ao parsear PDF:', input.nome, err)
      Sentry.captureException(err, { tags: { module: 'extrair-conteudo', operation: 'parse-pdf' }, extra: { nome: input.nome } })
      return null
    }
  }

  // ── Imagens — base64 para vision ──────────────────────────────────────────
  if (mime.startsWith('image/')) {
    const buf = await resolverBuffer(buffer, url)
    if (!buf) return null
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      console.warn('[extrairConteudo] imagem muito grande para vision:', buf.byteLength, 'bytes —', input.nome)
      return null
    }
    return { tipo: 'imagem', base64: buf.toString('base64'), mimeType: mime }
  }

  // ── Texto plano e CSV ─────────────────────────────────────────────────────
  if (mime.startsWith('text/')) {
    const buf = await resolverBuffer(buffer, url)
    if (!buf) return null
    const max = mime.includes('csv') ? MAX_CSV_CHARS : MAX_TEXTO_CHARS
    const texto = buf.toString('utf-8').slice(0, max)
    return texto ? { tipo: 'texto', texto } : null
  }

  return null  // tipo não suportado
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolverBuffer(buffer?: Buffer, url?: string): Promise<Buffer | null> {
  if (buffer) return buffer
  if (!url) return null
  try {
    let fetchUrl = url

    // R2 não é público — gerar URL assinada quando a URL pertence ao bucket
    const publicBase = (process.env.STORAGE_PUBLIC_URL ?? '').replace(/\/$/, '')
    if (publicBase && url.startsWith(publicBase)) {
      const key = url.slice(publicBase.length + 1)
      try {
        fetchUrl = await getDownloadUrl(key, 120)
      } catch (err) {
        console.error('[extrairConteudo] resolverBuffer falha ao gerar URL assinada:', key, err)
        Sentry.captureException(err, { tags: { module: 'extrair-conteudo', operation: 'signed-url' }, extra: { key } })
        return null
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const res = await fetch(fetchUrl, { signal: controller.signal })
      if (!res.ok) {
        const err = new Error(`[extrairConteudo] resolverBuffer HTTP ${res.status}: ${url.slice(0, 100)}`)
        console.error(err.message)
        Sentry.captureException(err, { tags: { module: 'extrair-conteudo', operation: 'fetch-buffer' }, extra: { status: res.status, url: url.slice(0, 120) } })
        return null
      }
      const data = await res.arrayBuffer()
      return Buffer.from(data)
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return null
  }
}

function formatarXmlMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null
  try {
    const m = meta as Record<string, unknown>
    const linhas: string[] = []
    if (m.tipo)             linhas.push(`Tipo: ${m.tipo}`)
    if (m.chave)            linhas.push(`Chave: ${m.chave}`)
    if (m.emitenteCnpj)     linhas.push(`CNPJ emitente: ${m.emitenteCnpj}`)
    if (m.emitenteNome)     linhas.push(`Emitente: ${m.emitenteNome}`)
    if (m.destinatarioCnpj) linhas.push(`CNPJ destinatário: ${m.destinatarioCnpj}`)
    if (m.destinatarioNome) linhas.push(`Destinatário: ${m.destinatarioNome}`)
    if (m.valor !== undefined) linhas.push(`Valor: R$ ${m.valor}`)
    if (m.dataEmissao)      linhas.push(`Emissão: ${m.dataEmissao}`)
    if (m.competencia)      linhas.push(`Competência: ${m.competencia}`)
    if (m.numero)           linhas.push(`Número: ${m.numero}`)
    if (m.serie)            linhas.push(`Série: ${m.serie}`)
    if (m.natureza)         linhas.push(`Natureza: ${m.natureza}`)
    if (linhas.length === 0) return JSON.stringify(meta).slice(0, MAX_TEXTO_CHARS)
    return linhas.join('\n')
  } catch {
    return null
  }
}
