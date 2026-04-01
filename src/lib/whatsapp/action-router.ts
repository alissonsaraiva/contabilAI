/**
 * Action router para documentos recebidos via WhatsApp.
 *
 * Quando um cliente envia uma imagem, PDF ou documento, este módulo:
 *   1. Classifica o tipo de documento usando a IA
 *   2. Extrai campos relevantes (valor, data, emitente, etc.)
 *   3. Registra uma interação no banco para auditoria
 *   4. Retorna o contexto enriquecido para o systemExtra
 *
 * O cadastro efetivo do documento no CRM é feito pela tool `anexarDocumentoChat`
 * após confirmação explícita do cliente — não acontece automaticamente.
 *
 * Chamado por processar-pendentes.ts antes do askAI principal.
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { askAI } from '@/lib/ai/ask'
import type { AIMessageContentPart } from '@/lib/ai/providers/types'
import { indexarAsync } from '@/lib/rag/indexar-async'

export type DocumentoWhatsApp = {
  classificado: true
  tipo:         string   // nota_fiscal | comprovante_pagamento | extrato_bancario | holerite | boleto | contrato | documento_pessoal | outro
  confianca:    'alta' | 'media' | 'baixa'
  campos:       Record<string, string>
  contextoIA:   string  // texto para injetar no systemExtra
} | {
  classificado: false
}

const PROMPT_CLASSIFICACAO = `Você é um classificador de documentos contábeis.
Analise o conteúdo abaixo e responda SOMENTE com JSON válido (sem texto antes ou depois):

{
  "tipo": "nota_fiscal|comprovante_pagamento|extrato_bancario|holerite|boleto|contrato|documento_pessoal|outro",
  "confianca": "alta|media|baixa",
  "campos": {
    "valor": "valor em reais se identificado",
    "data": "data do documento se identificada",
    "emitente": "emitente/empresa se identificado",
    "descricao": "breve descrição do conteúdo"
  }
}

Conteúdo recebido:`

/**
 * Classifica um documento recebido via WhatsApp e registra no banco.
 * Retorna contexto enriquecido para injetar no systemExtra do askAI.
 */
export async function roterarDocumentoWhatsapp(opts: {
  conteudo:          string
  mediaContentParts?: AIMessageContentPart[] | null
  clienteId?:        string
  leadId?:           string
  conversaId:        string
}): Promise<DocumentoWhatsApp> {
  const { conteudo, mediaContentParts, clienteId, leadId, conversaId } = opts

  // Só processa quando há conteúdo de mídia identificado
  const temMidia = (
    mediaContentParts != null ||
    conteudo.startsWith('[Documento recebido:') ||
    conteudo === '[imagem enviada]' ||
    conteudo === '[documento/imagem enviado]'
  )
  if (!temMidia) return { classificado: false }

  try {
    const pergunta = `${PROMPT_CLASSIFICACAO}\n${conteudo.slice(0, 1000)}`

    const result = await askAI({
      pergunta,
      context:      clienteId ? { escopo: 'cliente+global', clienteId }
        : leadId    ? { escopo: 'lead+global',    leadId }
        : { escopo: 'global' },
      feature:      'crm',
      maxTokens:    200,
      mediaContent: mediaContentParts ?? undefined,
      systemExtra:  'Responda SOMENTE com JSON válido. Nenhum texto adicional.',
    })

    // Remove blocos de código markdown se presentes
    const jsonStr = result.resposta
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    const json = JSON.parse(jsonStr) as {
      tipo:      string
      confianca: 'alta' | 'media' | 'baixa'
      campos:    Record<string, string>
    }

    if (!json.tipo) return { classificado: false }

    // Monta contexto legível para o systemExtra
    const camposFormatados = Object.entries(json.campos ?? {})
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `  • ${k}: ${v}`)
      .join('\n')

    const contextoIA = [
      `--- DOCUMENTO RECEBIDO ---`,
      `Tipo identificado: ${json.tipo} (confiança: ${json.confianca})`,
      camposFormatados ? `Campos extraídos:\n${camposFormatados}` : null,
      `--- FIM ---`,
      `Informe ao cliente o tipo de documento identificado e pergunte se deseja que ele seja cadastrado no sistema (aba de documentos do escritório). Se confirmar, use a ferramenta \`anexarDocumentoChat\` passando o tipo identificado.`,
      json.confianca === 'baixa' ? `Se houver dúvida sobre o tipo do documento, pergunte ao cliente antes de oferecer o cadastro.` : null,
    ].filter(Boolean).join('\n')

    // Registra interação de documento recebido (fire-and-forget)
    if (clienteId || leadId) {
      prisma.interacao.create({
        data: {
          tipo:      'documento_recebido_whatsapp',
          clienteId: clienteId ?? null,
          leadId:    leadId    ?? null,
          titulo:    `Documento via WhatsApp: ${json.tipo}`,
          conteudo:  conteudo.slice(0, 500),
          origem:    'ia',
          metadados: {
            classificacao: json.tipo,
            confianca:     json.confianca,
            campos:        json.campos,
            conversaId,
          } as object,
        },
      }).then(interacao => {
        indexarAsync('interacao', {
          id:        interacao.id,
          clienteId: interacao.clienteId,
          leadId:    interacao.leadId,
          tipo:      interacao.tipo,
          titulo:    interacao.titulo,
          conteudo:  interacao.conteudo,
          criadoEm:  interacao.criadoEm,
        })
      }).catch((err: unknown) => {
        console.error('[action-router] erro ao registrar interação de documento WhatsApp:', { clienteId, leadId, err })
        Sentry.captureException(err, { tags: { module: 'action-router', operation: 'registrar-interacao' }, extra: { clienteId, leadId } })
      })
    }

    return {
      classificado: true,
      tipo:         json.tipo,
      confianca:    json.confianca,
      campos:       json.campos ?? {},
      contextoIA,
    }
  } catch {
    // Falhou ao classificar — continua com fluxo normal
    return { classificado: false }
  }
}
