/**
 * resolverOS — orquestrador central de resolução de Ordem de Serviço.
 *
 * Fluxo completo em uma chamada:
 *   1. Atualiza OS (status, resposta, respondidoPorId, fechadoEm)
 *   2. Se arquivo: criarDocumento() → S3 + banco + RAG (com vínculo ordemServicoId)
 *   3. Se portal: documento já fica visível (visivelPortal default true)
 *   4. Se email:  enviarEmailComHistorico() com doc como anexo
 *   5. Se WhatsApp: prepararEntregaWhatsApp() + sendMedia + sendHumanLike
 *   6. Registra interação de resolução no histórico
 *
 * Chamado por:
 *   - PATCH /api/crm/ordens-servico/[id]
 *   - Futuramente: tool resolverOrdemServico (quando canal crm+arquivo fizer sentido)
 */

import { prisma } from '@/lib/prisma'
import { criarDocumento } from '@/lib/services/documentos'
import { enviarEmailComHistorico } from '@/lib/email/com-historico'
import { registrarInteracao } from '@/lib/services/interacoes'
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

  // Arquivo a entregar (opcional)
  arquivo?: {
    buffer:   Buffer
    nome:     string
    mimeType: string
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
}

export type ResolverOSResult = {
  osId:        string
  documentoId?: string
  emailOk?:    boolean
  whatsappOk?: boolean
}

export async function resolverOS(input: ResolverOSInput): Promise<ResolverOSResult> {
  // 1. Busca OS + cliente + empresa para contexto
  const os = await prisma.ordemServico.findUnique({
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
  if (!os) throw new Error(`OS ${input.osId} não encontrada`)

  // 2. Atualiza OS
  await prisma.ordemServico.update({
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

  // 3. Cria documento se arquivo fornecido
  let documentoUrl:   string | undefined
  let documentoNome:  string | undefined
  let documentoMime:  string | undefined

  if (input.arquivo) {
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
            titulo:    `Documento enviado via WhatsApp (OS: ${os.titulo})`,
            clienteId: os.clienteId,
            origem:    'usuario',
            usuarioId: input.usuarioId,
            metadados: { osId: input.osId, documentoId: result.documentoId, phone },
          })
        }
      } catch {
        result.whatsappOk = false
      }
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

  return result
}
