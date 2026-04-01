/**
 * resumirDocumento — gera um resumo IA para um Documento já salvo no banco.
 *
 * Fluxo:
 *   1. Busca o Documento no banco (url, mimeType, nome, tipo, categoria, xmlMetadata)
 *   2. Extrai o conteúdo legível do arquivo (pdf-parse / base64 / xml / texto)
 *   3. Chama a IA (provider/model configurado em "Resumo de Documentos")
 *   4. Salva resumo + resumoEm no banco
 *   5. Re-indexa no RAG incluindo o resumo (melhora busca semântica)
 *
 * resumirDocumentoAsync() é o wrapper fire-and-forget para uso em criarDocumento().
 */

import { prisma }                     from '@/lib/prisma'
import { getAiConfig }                from '@/lib/ai/config'
import { completeWithFallback }       from '@/lib/ai/providers/fallback'
import { extrairConteudoDocumento }   from './extrair-conteudo-documento'
import { indexarAsync }               from '@/lib/rag/indexar-async'
import type { AIMessageContentPart }  from '@/lib/ai/providers/types'

const SYSTEM_PROMPT = `Você é um assistente especializado em documentos contábeis e fiscais brasileiros.
Gere um resumo conciso (1 a 3 linhas) do documento fornecido, destacando:
- Tipo do documento (NF-e, DAS, DARF, holerite, contrato, etc.)
- Dados-chave: competência, valor, CNPJ, vencimento, partes envolvidas
- Qualquer informação de ação necessária (ex: "vence em 10/04/2026")

Seja objetivo. Não use markdown. Escreva em português do Brasil.`

export async function resumirDocumento(documentoId: string): Promise<string | null> {
  const doc = await prisma.documento.findUnique({
    where:  { id: documentoId },
    select: {
      id:          true,
      nome:        true,
      tipo:        true,
      categoria:   true,
      mimeType:    true,
      url:         true,
      xmlMetadata: true,
      clienteId:   true,
      empresaId:   true,
      leadId:      true,
      origem:      true,
      criadoEm:    true,
    },
  })

  if (!doc) return null

  const config   = await getAiConfig()
  const provider = config.providers.documentoResumo
  const model    = config.models.documentoResumo

  // Extrai conteúdo do arquivo
  const conteudo = await extrairConteudoDocumento({
    mimeType:    doc.mimeType ?? 'application/octet-stream',
    nome:        doc.nome,
    url:         doc.url,
    xmlMetadata: doc.xmlMetadata,
  })

  if (!conteudo) {
    // Formato não suportado — gera resumo só com metadados
    const resumoMeta = gerarResumoMetadados(doc)
    await salvarResumo(documentoId, resumoMeta, doc)
    return resumoMeta
  }

  // Monta mensagem (texto ou imagem + texto para vision)
  let userContent: AIMessageContentPart[]

  if (conteudo.tipo === 'imagem') {
    userContent = [
      { type: 'image', mediaType: conteudo.mimeType, data: conteudo.base64 },
      { type: 'text',  text: buildPromptTexto(doc) },
    ]
  } else {
    userContent = [{
      type: 'text',
      text: `${buildPromptTexto(doc)}\n\nConteúdo do arquivo:\n${conteudo.texto}`,
    }]
  }

  try {
    const result = await completeWithFallback(
      {
        system:      SYSTEM_PROMPT,
        messages:    [{ role: 'user', content: userContent }],
        maxTokens:   256,
        temperature: 0.2,
        model,
      },
      config,
      provider,
    )

    const resumo = result.text.trim()
    if (!resumo) {
      // IA retornou vazio — fallback para resumo baseado em metadados
      const resumoMeta = gerarResumoMetadados(doc)
      await salvarResumo(documentoId, resumoMeta, doc)
      return resumoMeta
    }

    await salvarResumo(documentoId, resumo, doc)
    return resumo
  } catch (err) {
    console.error('[resumir-documento] erro ao gerar resumo:', err)
    return null
  }
}

/** Wrapper fire-and-forget — para uso em criarDocumento() */
export function resumirDocumentoAsync(documentoId: string): void {
  // Evita chamada duplicada de IA se o documento já foi resumido (race condition com backfill)
  prisma.documento.findUnique({ where: { id: documentoId }, select: { resumo: true } })
    .then(doc => {
      if (doc?.resumo) return
      return resumirDocumento(documentoId)
    })
    .catch(err => console.error('[resumir-documento] async error:', err))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildPromptTexto(doc: {
  nome: string; tipo: string; categoria: string | null; origem: string; criadoEm: Date
}): string {
  const data = doc.criadoEm.toLocaleDateString('pt-BR')
  return [
    `Documento: ${doc.nome}`,
    `Tipo declarado: ${doc.tipo}`,
    doc.categoria ? `Categoria: ${doc.categoria}` : '',
    `Origem: ${doc.origem}`,
    `Recebido em: ${data}`,
    '',
    'Gere um resumo conciso deste documento.',
  ].filter(Boolean).join('\n')
}

function gerarResumoMetadados(doc: {
  nome: string; tipo: string; categoria: string | null; criadoEm: Date
}): string {
  const data = doc.criadoEm.toLocaleDateString('pt-BR')
  const cat  = doc.categoria && doc.categoria !== 'geral' ? ` — ${doc.categoria.replace(/_/g, ' ')}` : ''
  return `${doc.tipo}${cat}. Arquivo: ${doc.nome}. Recebido em ${data}.`
}

async function salvarResumo(
  documentoId: string,
  resumo:      string,
  doc: {
    clienteId: string | null
    empresaId: string | null
    leadId:    string | null
    tipo:      string
    nome:      string
    categoria: string | null
    origem:    string
    criadoEm:  Date
  },
): Promise<void> {
  await prisma.documento.update({
    where: { id: documentoId },
    data:  { resumo, resumoEm: new Date() },
  })

  // Re-indexa no RAG com o resumo incluído (melhora busca semântica)
  indexarAsync('documento', {
    id:        documentoId,
    clienteId: doc.clienteId,
    empresaId: doc.empresaId,
    leadId:    doc.leadId,
    tipo:      doc.tipo,
    nome:      doc.nome,
    categoria: doc.categoria,
    origem:    doc.origem,
    criadoEm:  doc.criadoEm,
    resumo,
  })
}
