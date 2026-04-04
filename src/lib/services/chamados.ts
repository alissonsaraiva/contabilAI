/**
 * resolverChamado — orquestrador central de resolução de Chamado.
 *
 * Fluxo completo em uma chamada:
 *   1. Atualiza o chamado (status, resposta, respondidoPorId, fechadoEm)
 *   2. Se arquivo: criarDocumento() → S3 + banco + RAG (com vínculo chamadoId)
 *   3. Se portal: documento já fica visível (visivelPortal default true)
 *   4. Se email:  enviarEmailComHistorico() com doc como anexo
 *   5. Se WhatsApp: prepararEntregaWhatsApp() + sendMedia + sendHumanLike
 *   6. Registra interação de resolução no histórico
 *
 * Chamado por:
 *   - PATCH /api/crm/chamados/[id]
 */

import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { criarDocumento } from '@/lib/services/documentos'
import { enviarEmailComHistorico } from '@/lib/email/com-historico'
import { registrarInteracao } from '@/lib/services/interacoes'
import { sendPushToCliente } from '@/lib/push'
import { prepararEntregaWhatsApp } from '@/lib/whatsapp/entregar-documento'
import { sendMedia, sendText } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import type { CategoriaDocumento } from '@prisma/client'
import type { EvolutionConfig } from '@/lib/evolution'

export type ResolverOSInput = {
  osId:        string
  usuarioId?:  string

  // Resposta textual (opcional — pode resolver só com status)
  resposta?:  string

  // Arquivo NOVO a entregar (upload de buffer)
  arquivo?: {
    buffer:   Buffer
    nome:     string
    mimeType: string
  }
  // Documento JÁ EXISTENTE no sistema (referência — não faz upload, reutiliza URL)
  documentoExistente?: {
    id:       string
    url:      string
    nome:     string
    mimeType: string | null
  }
  categoria?: CategoriaDocumento

  // Canais de envio ao cliente (independentes)
  canais?: {
    // Portal: sempre ativo se há documento (visivelPortal do OS herdado)
    email?: {
      ativo:   boolean
      assunto: string
      corpo:   string
    }
    whatsapp?: {
      ativo:    boolean
      mensagem: string
    }
  }

  // Destinatários adicionais WhatsApp (sócios, além do titular)
  wppDestinatariosAdicionais?: Array<{ nome: string; telefone: string }>
}

export type ResolverOSResult = {
  osId:        string
  documentoId?: string
  emailOk?:    boolean
  whatsappOk?: boolean
}

export async function resolverOS(input: ResolverOSInput): Promise<ResolverOSResult> {
  // 1. Busca OS + cliente + empresa para contexto
  const os = await prisma.chamado.findUnique({
    where:   { id: input.osId },
    include: {
      cliente: {
        select: {
          id: true, nome: true, email: true,
          whatsapp: true, telefone: true,
          empresaId: true, tipoContribuinte: true,
        },
      },
      empresa: { select: { id: true } },
    },
  })
  if (!os) throw new Error(`Chamado ${input.osId} não encontrado`)

  // 2. Atualiza OS
  await prisma.chamado.update({
    where: { id: input.osId },
    data: {
      status:         'resolvida',
      resposta:       input.resposta ?? os.resposta,
      respondidoEm:   os.respondidoEm ?? new Date(),
      respondidoPorId: input.usuarioId ?? null,
      fechadoEm:      new Date(),
    },
  })

  const result: ResolverOSResult = { osId: input.osId }

  // 3. Documento: upload novo OU reutilizar existente do sistema
  let documentoUrl:   string | undefined
  let documentoNome:  string | undefined
  let documentoMime:  string | undefined

  if (input.arquivo) {
    // Upload de arquivo novo → cria registro no banco
    const empresaId = os.cliente.empresaId ?? os.empresa?.id
    const doc = await criarDocumento({
      clienteId:      os.clienteId,
      empresaId,
      ordemServicoId: input.osId,
      arquivo:        input.arquivo,
      tipo:           os.titulo,
      categoria:      input.categoria,
      origem:         'crm',
    })
    result.documentoId = doc.id
    documentoUrl       = doc.url
    documentoNome      = doc.nome
    documentoMime      = input.arquivo.mimeType
  } else if (input.documentoExistente) {
    // Documento já existente no sistema — apenas vincula à OS e usa a URL
    result.documentoId = input.documentoExistente.id
    documentoUrl       = input.documentoExistente.url
    documentoNome      = input.documentoExistente.nome
    documentoMime      = input.documentoExistente.mimeType ?? undefined
    // Vincula o documento existente a esta OS
    await prisma.documento.update({
      where: { id: input.documentoExistente.id },
      data:  { ordemServicoId: input.osId },
    }).catch((err: unknown) => {
      console.warn('[chamados] falha ao vincular documento ao chamado (pode já estar vinculado):', { osId: input.osId, documentoId: input.documentoExistente?.id, err })
    })
  }

  // 4. Envia por e-mail
  if (input.canais?.email?.ativo && os.cliente.email) {
    const emailResult = await enviarEmailComHistorico({
      para:      os.cliente.email,
      assunto:   input.canais.email.assunto,
      corpo:     input.canais.email.corpo,
      clienteId: os.clienteId,
      origem:    'usuario',
      usuarioId: input.usuarioId,
      anexos:    documentoUrl && documentoNome
        ? [{ nome: documentoNome, url: documentoUrl, mimeType: documentoMime }]
        : undefined,
      metadados: { osId: input.osId, documentoId: result.documentoId },
    })
    result.emailOk = emailResult.ok
  }

  // 5. Envia por WhatsApp
  if (input.canais?.whatsapp?.ativo) {
    const phone = os.cliente.whatsapp ?? os.cliente.telefone
    if (phone && documentoUrl && documentoNome) {
      try {
        const cfgRow = await prisma.escritorio.findFirst({
          select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
        })
        if (cfgRow?.evolutionApiUrl && cfgRow.evolutionApiKey && cfgRow.evolutionInstance) {
          const cfg: EvolutionConfig = {
            baseUrl:  cfgRow.evolutionApiUrl,
            apiKey:   isEncrypted(cfgRow.evolutionApiKey) ? decrypt(cfgRow.evolutionApiKey) : cfgRow.evolutionApiKey,
            instance: cfgRow.evolutionInstance,
          }
          const digits    = phone.replace(/\D/g, '')
          const remoteJid = `${digits.startsWith('55') ? digits : `55${digits}`}@s.whatsapp.net`

          // Envia mensagem de texto primeiro
          if (input.canais.whatsapp.mensagem) {
            await sendText(cfg, remoteJid, input.canais.whatsapp.mensagem)
          }

          // Prepara e envia documento via abstração plugável
          const entrega = await prepararEntregaWhatsApp(
            { id: result.documentoId ?? '', nome: documentoNome, url: documentoUrl, mimeType: documentoMime ?? null, tipo: os.titulo },
            { mensagem: undefined }, // caption já na mensagem de texto acima
          )
          const sendResult = await sendMedia(cfg, remoteJid, entrega.sendMediaParams)
          result.whatsappOk = sendResult.ok

          // Registra interação de envio WhatsApp
          await registrarInteracao({
            tipo:      'whatsapp_enviado',
            titulo:    `Documento enviado via WhatsApp (Chamado: ${os.titulo})`,
            clienteId: os.clienteId,
            origem:    'usuario',
            usuarioId: input.usuarioId,
            metadados: { osId: input.osId, documentoId: result.documentoId, phone },
          })
        }
      } catch (err) {
        Sentry.captureException(err, { tags: { module: 'chamados', operation: 'whatsapp-entrega' }, extra: { osId: input.osId } })
        result.whatsappOk = false
      }
    }
  }

  // 5b. Envia WhatsApp para destinatários adicionais (sócios)
  if (input.canais?.whatsapp?.ativo && input.wppDestinatariosAdicionais?.length) {
    try {
      const cfgRow = await prisma.escritorio.findFirst({
        select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
      })
      if (cfgRow?.evolutionApiUrl && cfgRow.evolutionApiKey && cfgRow.evolutionInstance) {
        const cfg: EvolutionConfig = {
          baseUrl:  cfgRow.evolutionApiUrl,
          apiKey:   isEncrypted(cfgRow.evolutionApiKey) ? decrypt(cfgRow.evolutionApiKey) : cfgRow.evolutionApiKey,
          instance: cfgRow.evolutionInstance,
        }
        for (const dest of input.wppDestinatariosAdicionais) {
          const digits    = dest.telefone.replace(/\D/g, '')
          const jid       = `${digits.startsWith('55') ? digits : `55${digits}`}@s.whatsapp.net`
          if (input.canais.whatsapp.mensagem) {
            await sendText(cfg, jid, input.canais.whatsapp.mensagem).catch((err: unknown) => {
              console.error('[chamados] falha ao enviar WhatsApp para destinatário adicional:', { jid, osId: input.osId, err })
              Sentry.captureException(err, { tags: { module: 'chamados', operation: 'whatsapp-adicional-texto' }, extra: { osId: input.osId, jid } })
            })
          }
          if (documentoUrl && documentoNome) {
            const entregaAd = await prepararEntregaWhatsApp(
              { id: result.documentoId ?? '', nome: documentoNome, url: documentoUrl, mimeType: documentoMime ?? null, tipo: os.titulo },
              { mensagem: undefined },
            )
            await sendMedia(cfg, jid, entregaAd.sendMediaParams).catch((err: unknown) => {
              console.error('[chamados] falha ao enviar mídia WhatsApp para destinatário adicional:', { jid, osId: input.osId, err })
              Sentry.captureException(err, { tags: { module: 'chamados', operation: 'whatsapp-adicional-midia' }, extra: { osId: input.osId, jid, documentoId: result.documentoId } })
            })
          }
          await registrarInteracao({
            tipo:      'whatsapp_enviado',
            titulo:    `Documento enviado via WhatsApp (sócio ${dest.nome})`,
            clienteId: os.clienteId,
            origem:    'usuario',
            usuarioId: input.usuarioId,
            metadados: { osId: input.osId, documentoId: result.documentoId, phone: dest.telefone },
          })
        }
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { module: 'chamados', operation: 'whatsapp-adicionais' }, extra: { osId: input.osId } })
    }
  }

  // 6. Registra interação de resolução no histórico
  await registrarInteracao({
    tipo:            'os_resolvida',
    titulo:          `Chamado resolvido: ${os.titulo}`,
    conteudo:        input.resposta,
    clienteId:       os.clienteId,
    origem:          'usuario',
    usuarioId:       input.usuarioId,
    escritorioEvento: false,
    metadados: {
      osId:        input.osId,
      documentoId: result.documentoId,
      emailOk:     result.emailOk,
      whatsappOk:  result.whatsappOk,
    },
  })

  // 7. Push notification — avisa o cliente no portal mesmo com o app fechado
  sendPushToCliente(os.clienteId, {
    title: 'Chamado respondido',
    body:  `Seu chamado "${os.titulo}" foi respondido. Acesse o portal para ver a resposta.`,
    url:   '/portal/suporte',
  }).catch((err: unknown) => {
    console.warn('[chamados] falha ao enviar push notification:', { clienteId: os.clienteId, osId: input.osId, err })
    Sentry.captureException(err, { tags: { module: 'chamados', operation: 'push-notification' }, extra: { clienteId: os.clienteId, osId: input.osId } })
  })

  return result
}
