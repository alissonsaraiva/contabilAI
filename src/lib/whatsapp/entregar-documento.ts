/**
 * prepararEntregaWhatsApp — abstração plugável de entrega de documento via WhatsApp.
 *
 * Estratégias configuradas em Escritorio.whatsappDocumentoEntrega:
 *   "direto"      → envia URL pública do S3 diretamente (padrão atual)
 *   "senha"       → aplica proteção de senha (PDF: qpdf, OFX/XLS: 7z) — futuro
 *   "link_portal" → envia link autenticado do portal do cliente — futuro
 *
 * Uso:
 *   const entrega = await prepararEntregaWhatsApp(documento, { mensagem: 'Segue sua guia.' })
 *   await sendMedia(cfg, remoteJid, entrega.sendMediaParams)
 *
 * Para adicionar nova estratégia: apenas implementar o case correspondente abaixo.
 * Nenhum outro arquivo precisa mudar.
 */

import { prisma } from '@/lib/prisma'
import { getDownloadUrl } from '@/lib/storage'

export type DocumentoParaEntrega = {
  id:       string
  nome:     string
  url:      string
  mimeType: string | null
  tipo:     string
}

export type EntregaWhatsAppOpcoes = {
  mensagem?: string
}

export type ResultadoEntrega = {
  /** Params prontos para passar direto ao sendMedia() da Evolution */
  sendMediaParams: {
    mediatype: 'document' | 'image' | 'video' | 'audio'
    mimetype:  string
    fileName:  string
    caption?:  string
    mediaUrl?: string
    // Para "senha": o buffer será adicionado aqui no futuro
  }
  /** Estratégia usada — útil para logs/debug */
  estrategia: string
  /** Senha gerada, se estratégia = 'senha' */
  senha?: string
}

export async function prepararEntregaWhatsApp(
  documento: DocumentoParaEntrega,
  opcoes: EntregaWhatsAppOpcoes = {},
): Promise<ResultadoEntrega> {
  const row = await prisma.escritorio.findFirst({
    select: { whatsappDocumentoEntrega: true },
  })
  const estrategia = row?.whatsappDocumentoEntrega ?? 'direto'

  switch (estrategia) {
    case 'senha':
      // TODO: implementar quando definirmos a estratégia de senha
      // Opções: qpdf para PDF, 7z AES-256 para OFX/XLS
      // Por ora, fallthrough para 'direto' com aviso
      console.warn('[entregar-documento] estratégia "senha" não implementada — usando "direto"')
      return buildEntregaDireta(documento, opcoes, estrategia)

    case 'link_portal':
      // TODO: gerar link autenticado do portal (token temporário)
      // Por ora, fallthrough para 'direto' com aviso
      console.warn('[entregar-documento] estratégia "link_portal" não implementada — usando "direto"')
      return buildEntregaDireta(documento, opcoes, estrategia)

    case 'direto':
    default:
      return buildEntregaDireta(documento, opcoes, 'direto')
  }
}

function inferirMediaType(mimeType: string | null): ResultadoEntrega['sendMediaParams']['mediatype'] {
  if (!mimeType) return 'document'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
}

/**
 * Gera URL acessível para a Evolution API fazer fetch.
 * R2 é privado — URLs públicas retornam 400. Usamos URL assinada (10 min).
 */
async function resolverMediaUrl(url: string): Promise<string> {
  const publicBase = (process.env.STORAGE_PUBLIC_URL ?? '').replace(/\/$/, '')
  if (publicBase && url.startsWith(publicBase)) {
    const key = url.slice(publicBase.length + 1)
    return getDownloadUrl(key, 600) // 10 min — tempo suficiente para Evolution processar
  }
  return url
}

async function buildEntregaDireta(
  doc: DocumentoParaEntrega,
  opcoes: EntregaWhatsAppOpcoes,
  estrategia: string,
): Promise<ResultadoEntrega> {
  return {
    sendMediaParams: {
      mediatype: inferirMediaType(doc.mimeType),
      mimetype:  doc.mimeType ?? 'application/octet-stream',
      fileName:  doc.nome,
      caption:   opcoes.mensagem,
      mediaUrl:  await resolverMediaUrl(doc.url),
    },
    estrategia,
  }
}
