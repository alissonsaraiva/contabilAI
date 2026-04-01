/**
 * classificarDocumento — decide se um arquivo recebido deve ser arquivado
 * na pasta de documentos do cliente, ou é apenas contexto conversacional.
 *
 * Uso:
 *   - WhatsApp:  contexto = últimas 5 mensagens da conversa
 *   - Email:     contexto = assunto + corpo do email
 *   - Portal:    contexto = últimas 5 interações do cliente
 *
 * XMLs (NFe, CT-e, NFS-e) são sempre arquivados — nunca são conversacionais.
 * Para PDFs e imagens, a IA decide com base no conteúdo + contexto.
 */

import { getAiConfig }            from '@/lib/ai/config'
import { completeWithFallback }   from '@/lib/ai/providers/fallback'
import { extrairConteudoDocumento } from './extrair-conteudo-documento'
import type { AIMessageContentPart } from '@/lib/ai/providers/types'

export type ClassificarDocumentoInput = {
  arquivo: {
    nome:           string
    mimeType:       string
    buffer?:        Buffer   // buffer raw (prioritário)
    textoExtraido?: string   // texto já extraído (ex: PDF do WhatsApp)
    base64?:        string   // imagem já codificada (ex: WhatsApp image)
    xmlMetadata?:   unknown  // XML já parseado
  }
  /** Contexto conversacional formatado como string legível */
  contexto: string
}

const SYSTEM_PROMPT = `Você é um classificador de documentos para um escritório de contabilidade.
Sua tarefa é determinar se um arquivo recebido deve ser arquivado na pasta de documentos do cliente.

Devem ser ARQUIVADOS: nota fiscal (NFe/NFS-e), boleto, DAS, guia de imposto, DARF, GPS, contrato,
procuração, declaração, comprovante de pagamento, extrato bancário, holerite, certidão, alvará,
RG, CPF, CNH, CNPJ, balancete, DRE, balanço patrimonial, relatório contábil, escritura,
recibo oficial, laudo, parecer técnico.

NÃO devem ser arquivados: print de tela, captura de conversa, foto de fachada,
meme, imagem ilustrativa sem valor documental, rascunho informal, screenshot de sistema
solicitando ajuda, foto de produto.

Responda APENAS com "sim" (arquivar) ou "não" (ignorar). Sem explicação.`

export async function classificarDocumento(
  input: ClassificarDocumentoInput,
): Promise<boolean> {
  const { arquivo, contexto } = input
  const mime = arquivo.mimeType.toLowerCase()

  // XMLs são sempre documentos — nunca conversacionais
  if (mime.includes('xml') || arquivo.nome.toLowerCase().endsWith('.xml')) {
    return true
  }

  const config = await getAiConfig()
  const provider = config.providers.documentoResumo
  const model    = config.models.documentoResumo

  // Monta conteúdo do arquivo para análise
  let conteudoTexto: string | null = null
  let imagemBase64: string | null  = null
  let imagemMime:   string | null  = null

  if (arquivo.textoExtraido) {
    conteudoTexto = arquivo.textoExtraido.slice(0, 3_000)
  } else if (arquivo.base64) {
    imagemBase64 = arquivo.base64
    imagemMime   = mime
  } else if (arquivo.xmlMetadata || arquivo.buffer) {
    const extraido = await extrairConteudoDocumento({
      mimeType:    arquivo.mimeType,
      nome:        arquivo.nome,
      buffer:      arquivo.buffer,
      xmlMetadata: arquivo.xmlMetadata,
    })
    if (extraido?.tipo === 'texto')  conteudoTexto = extraido.texto.slice(0, 3_000)
    if (extraido?.tipo === 'imagem') { imagemBase64 = extraido.base64; imagemMime = extraido.mimeType }
  }

  // Monta o prompt do usuário
  const promptPartes: string[] = [
    `Arquivo: "${arquivo.nome}" (${arquivo.mimeType})`,
    '',
    `Contexto da conversa:\n${contexto || 'Sem histórico disponível.'}`,
  ]
  if (conteudoTexto) {
    promptPartes.push(`\nConteúdo do arquivo (trecho):\n${conteudoTexto}`)
  }
  promptPartes.push('\nEste arquivo deve ser arquivado como documento formal do cliente?')

  const pergunta = promptPartes.join('\n')

  // Monta partes de conteúdo (texto ou texto + imagem para vision)
  const userContent: AIMessageContentPart[] = imagemBase64 && imagemMime
    ? [
        { type: 'image',  mediaType: imagemMime, data: imagemBase64 },
        { type: 'text',   text: pergunta },
      ]
    : [{ type: 'text', text: pergunta }]

  try {
    const result = await completeWithFallback(
      {
        system:    SYSTEM_PROMPT,
        messages:  [{ role: 'user', content: userContent }],
        maxTokens: 10,
        temperature: 0,
        model,
      },
      config,
      provider,
    )

    const resposta = result.text.trim().toLowerCase()
    return resposta.startsWith('sim') || resposta === 's'
  } catch (err) {
    console.error('[classificar-documento] falha na classificação via IA:', {
      nome: arquivo.nome,
      mimeType: arquivo.mimeType,
      err,
    })
    // Propaga o erro para o caller distinguir "IA indisponível" de "não é documento"
    throw err
  }
}

// ─── Helpers para construção de contexto por canal ───────────────────────────

/**
 * Busca as últimas N mensagens de uma conversa WhatsApp/portal para usar
 * como contexto na classificação.
 */
export async function buildContextoConversa(
  conversaId: string,
  limite = 5,
): Promise<string> {
  const { prisma } = await import('@/lib/prisma')
  const msgs = await prisma.mensagemIA.findMany({
    where:   { conversaId, status: { not: 'pending' } },
    orderBy: { criadaEm: 'desc' },
    take:    limite,
    select:  { role: true, conteudo: true },
  })
  if (msgs.length === 0) return 'Sem histórico de conversa.'
  return msgs
    .reverse()
    .map(m => `${m.role === 'user' ? 'Cliente' : 'Assistente'}: ${m.conteudo.slice(0, 300)}`)
    .join('\n')
}

/**
 * Retorna as últimas N interações do cliente no portal como contexto.
 */
export async function buildContextoPortal(
  clienteId: string,
  limite = 5,
): Promise<string> {
  const { prisma } = await import('@/lib/prisma')
  const interacoes = await prisma.interacao.findMany({
    where:   { clienteId },
    orderBy: { criadoEm: 'desc' },
    take:    limite,
    select:  { tipo: true, titulo: true, criadoEm: true },
  })
  if (interacoes.length === 0) return 'Sem histórico anterior do cliente no portal.'
  return interacoes
    .reverse()
    .map(i => `[${i.criadoEm.toLocaleDateString('pt-BR')}] ${i.titulo ?? i.tipo}`)
    .join('\n')
}

/**
 * Formata contexto de email (assunto + corpo truncado).
 */
export function buildContextoEmail(assunto: string, corpo: string): string {
  return [
    `Assunto do email: ${assunto}`,
    `Corpo do email:\n${corpo.slice(0, 3_000)}`,
  ].join('\n\n')
}
