/**
 * Arquivamento assíncrono de mídia recebida via WhatsApp.
 *
 * Fire-and-forget — nunca bloqueia o webhook nem o cron.
 * Classifica com IA e, se for documento formal, persiste via criarDocumento().
 */

import { prisma }                                        from '@/lib/prisma'
import { classificarDocumento, buildContextoConversa }  from '@/lib/services/classificar-documento'
import { criarDocumento }                                from '@/lib/services/documentos'

export type ArquivarMidiaInput = {
  media:          { buffer: Buffer; mimeType: string; fileName?: string }
  tipoMidia:      'imagem' | 'documento'
  conversaId:     string
  clienteId?:     string
  leadId?:        string
  remoteJid:      string
  base64?:        string   // já calculado (evita re-encode)
  textoExtraido?: string   // já extraído (PDF)
}

/**
 * Classifica a mídia com contexto da conversa e, se for um documento formal,
 * salva via criarDocumento() (que dispara resumo + RAG automaticamente).
 * Totalmente fire-and-forget — nunca bloqueia o webhook.
 */
export function arquivarMidiaWhatsappAsync(input: ArquivarMidiaInput): void {
  if (!input.clienteId && !input.leadId) return  // sem vínculo, nada a fazer

  const tipoLabel = input.tipoMidia === 'imagem' ? 'WhatsApp — Imagem' : 'WhatsApp — Documento'

  // Busca empresaId do cliente (legado → fallback junção 1:N)
  const getEmpresaId = input.clienteId
    ? prisma.cliente.findUnique({ where: { id: input.clienteId }, select: { empresaId: true } })
        .then(async (c) => {
          if (c?.empresaId) return c.empresaId
          const v = await prisma.clienteEmpresa.findFirst({
            where: { clienteId: input.clienteId!, principal: true },
            select: { empresaId: true },
          })
          return v?.empresaId ?? undefined
        })
        .catch(err => { console.error('[whatsapp/arquivar-midia] falha:', err); return undefined })
    : Promise.resolve(undefined)

  Promise.all([buildContextoConversa(input.conversaId, 5), getEmpresaId])
    .then(async ([contexto, empresaId]) => {
      let deveArquivar: boolean
      try {
        deveArquivar = await classificarDocumento({
          arquivo: {
            nome:          input.media.fileName ?? 'arquivo',
            mimeType:      input.media.mimeType,
            buffer:        input.base64 ? undefined : input.media.buffer,
            base64:        input.base64,
            textoExtraido: input.textoExtraido,
          },
          contexto,
        })
      } catch (err) {
        // IA de classificação falhou — salva com status pendente para revisão/retry
        console.error('[webhook] falha na classificação de documento via IA:', { remoteJid: input.remoteJid, err })
        return criarDocumento({
          clienteId: input.clienteId,
          leadId:    input.leadId,
          empresaId,
          arquivo: {
            buffer:   input.media.buffer,
            nome:     input.media.fileName ?? 'arquivo',
            mimeType: input.media.mimeType,
          },
          tipo:         tipoLabel,
          status:       'pendente',
          origem:       'whatsapp',
          resumoStatus: 'pendente',
          metadados:    { fonte: 'whatsapp', remoteJid: input.remoteJid, classificacaoFalhou: true },
        })
      }

      if (!deveArquivar) return

      return criarDocumento({
        clienteId: input.clienteId,
        leadId:    input.leadId,
        empresaId,
        arquivo: {
          buffer:   input.media.buffer,
          nome:     input.media.fileName ?? 'arquivo',
          mimeType: input.media.mimeType,
        },
        tipo:      tipoLabel,
        status:    'recebido',
        origem:    'whatsapp',
        metadados: { fonte: 'whatsapp', remoteJid: input.remoteJid },
      })
    })
    .catch(err => console.error('[whatsapp/webhook] arquivarMidia error:', err))
}
