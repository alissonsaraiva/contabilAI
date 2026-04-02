import * as Sentry from '@sentry/nextjs'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { getSpedyClienteClient } from '@/lib/spedy'
import { sendText, sendMedia } from '@/lib/evolution'
import type { EvolutionConfig } from '@/lib/evolution'
import { logger } from '@/lib/logger'
import { getEscritorioSpedy } from './config'
import { buscarPdfXml } from './backup'
import { notificarEquipeEntregaFalhou } from './notificacoes'

// ─── Entrega ao cliente ───────────────────────────────────────────────────────

export async function entregarNotaCliente(
  notaFiscalId: string,
  canal: 'whatsapp' | 'email' | 'portal',
): Promise<void> {
  const nota = await prisma.notaFiscal.findUnique({
    where:   { id: notaFiscalId },
    include: { cliente: true, empresa: true },
  })

  if (!nota) throw new Error(`NotaFiscal ${notaFiscalId} não encontrada`)
  if (nota.status !== 'autorizada') throw new Error(`NFS-e não está autorizada (status: ${nota.status})`)
  if (!nota.spedyId) throw new Error('NFS-e sem spedyId — não é possível gerar PDF URL')

  const config   = await getEscritorioSpedy()
  const dataAuth = nota.autorizadaEm ?? nota.criadoEm
  const mesAno   = format(dataAuth, 'MMMM/yyyy', { locale: ptBR })
  const numero   = nota.numero ? `nº ${nota.numero}` : ''

  const { pdfBuffer, xmlBuffer } = await buscarPdfXml({
    id:      nota.id,
    pdfUrl:  nota.pdfUrl,
    xmlUrl:  nota.xmlUrl,
    spedyId: nota.spedyId,
    empresa: nota.empresa,
  })

  const nomeArquivo = nota.numero ? `NFS-e-${nota.numero}` : 'NFS-e'

  if (canal === 'whatsapp') {
    const whatsapp = nota.cliente.whatsapp ?? nota.cliente.telefone
    if (!whatsapp) {
      logger.warn('nfse-entrega-whatsapp-sem-numero', { notaId: nota.id })
      return
    }

    const apiKey = config.evolutionApiKey
      ? (isEncrypted(config.evolutionApiKey) ? decrypt(config.evolutionApiKey) : config.evolutionApiKey)
      : null

    if (!config.evolutionApiUrl || !apiKey || !config.evolutionInstance) {
      logger.warn('nfse-evolution-nao-configurado', { notaId: nota.id })
      // Notifica equipe para que saibam que o cliente não recebeu a nota
      await notificarEquipeEntregaFalhou(nota.id, nota.clienteId, 'whatsapp', 'Integração WhatsApp (Evolution) não configurada — entrega automática indisponível')
      return
    }

    const evoCfg: EvolutionConfig = {
      baseUrl:  config.evolutionApiUrl,
      apiKey,
      instance: config.evolutionInstance,
    }

    const remoteJid     = whatsapp.replace(/\D/g, '') + '@s.whatsapp.net'
    const tomadorInfo   = nota.tomadorNome ? ` emitida para *${nota.tomadorNome}*` : ''
    const descricaoInfo = nota.descricao   ? `\n📋 Serviço: ${nota.descricao}` : ''
    const texto = `✅ *NFS-e autorizada!*\n\nOlá, ${nota.cliente.nome.split(' ')[0]}! Sua Nota Fiscal de Serviço ${numero}${tomadorInfo} foi autorizada pela prefeitura.${descricaoInfo}\n\n💰 Valor: R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`

    // Tenta enviar com retry (3 tentativas, backoff 2s)
    const errosEntrega: string[] = []

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        await sendText(evoCfg, remoteJid, texto)
        break
      } catch (err) {
        if (tentativa === 3) errosEntrega.push(`texto: ${err instanceof Error ? err.message : String(err)}`)
        else await new Promise(r => setTimeout(r, 2000 * tentativa))
      }
    }

    if (pdfBuffer) {
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        try {
          await sendMedia(evoCfg, remoteJid, {
            mediatype:   'document',
            mimetype:    'application/pdf',
            fileName:    `${nomeArquivo}.pdf`,
            caption:     `📄 PDF da ${nomeArquivo}`,
            mediaBase64: pdfBuffer.toString('base64'),
          })
          break
        } catch (err) {
          if (tentativa === 3) errosEntrega.push(`pdf: ${err instanceof Error ? err.message : String(err)}`)
          else await new Promise(r => setTimeout(r, 2000 * tentativa))
        }
      }
    }

    if (xmlBuffer) {
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        try {
          await sendMedia(evoCfg, remoteJid, {
            mediatype:   'document',
            mimetype:    'application/xml',
            fileName:    `${nomeArquivo}.xml`,
            caption:     `🗂️ XML da ${nomeArquivo} (para importação em sistemas contábeis)`,
            mediaBase64: xmlBuffer.toString('base64'),
          })
          break
        } catch (err) {
          if (tentativa === 3) errosEntrega.push(`xml: ${err instanceof Error ? err.message : String(err)}`)
          else await new Promise(r => setTimeout(r, 2000 * tentativa))
        }
      }
    }

    // Se houve falhas após todas as tentativas, notifica a equipe e NÃO marca como entregue
    if (errosEntrega.length > 0) {
      const motivo = errosEntrega.join('; ')
      logger.error('nfse-entrega-whatsapp-falhou-apos-retry', { notaId: nota.id, motivo })
      Sentry.captureException(new Error(`Entrega WhatsApp falhou: ${motivo}`), {
        tags:  { module: 'nfse-service', operation: 'entrega-whatsapp' },
        extra: { notaId: nota.id, whatsapp, motivo },
      })
      await notificarEquipeEntregaFalhou(nota.id, nota.clienteId, 'whatsapp', motivo)
      // Retorna sem atualizar enviadaClienteEm — entrega não ocorreu de fato
      return
    }

  } else if (canal === 'email') {
    const { sendEmail } = await import('@/lib/email/send')
    if (nota.cliente.email) {
      const tomadorParteEmail   = nota.tomadorNome ? ` emitida para <b>${nota.tomadorNome}</b>` : ''
      const descricaoParteEmail = nota.descricao   ? `<p><b>Serviço:</b> ${nota.descricao}</p>` : ''
      const anexos = [
        pdfBuffer && { nome: `${nomeArquivo}.pdf`, content: pdfBuffer, mimeType: 'application/pdf' },
        xmlBuffer && { nome: `${nomeArquivo}.xml`, content: xmlBuffer, mimeType: 'application/xml' },
      ].filter(Boolean) as { nome: string; content: Buffer; mimeType: string }[]

      try {
        await sendEmail({
          para:    nota.cliente.email,
          assunto: `NFS-e ${numero} autorizada — ${mesAno}`,
          corpo:   `<p>Olá, ${nota.cliente.nome.split(' ')[0]}!</p><p>Sua Nota Fiscal de Serviço ${numero}${tomadorParteEmail} foi <b>autorizada</b> pela prefeitura.</p>${descricaoParteEmail}<p><b>Valor:</b> R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}</p><p>Seguem em anexo o <b>PDF</b> e o <b>XML</b> da nota. O PDF também está disponível no portal do cliente para consultas futuras.</p>`,
          anexos,
        })
      } catch (emailErr) {
        const motivo = emailErr instanceof Error ? emailErr.message : String(emailErr)
        logger.error('nfse-entrega-email-falhou', { notaId: nota.id, motivo })
        Sentry.captureException(emailErr, {
          tags:  { module: 'nfse-service', operation: 'entrega-email' },
          extra: { notaId: nota.id, email: nota.cliente.email, motivo },
        })
        await notificarEquipeEntregaFalhou(nota.id, nota.clienteId, 'email', motivo)
        // Retorna sem atualizar enviadaClienteEm — entrega não ocorreu de fato
        return
      }
    } else {
      // Cliente sem e-mail cadastrado — equipe deve ser avisada
      logger.warn('nfse-entrega-email-sem-email', { notaId: nota.id, clienteId: nota.clienteId })
      await notificarEquipeEntregaFalhou(nota.id, nota.clienteId, 'email', 'Cliente não possui e-mail cadastrado')
      return
    }
  }
  // canal portal: não é necessário envio ativo — o arquivo já estará disponível no portal

  // Atualiza registro de entrega — só chega aqui se a entrega foi bem-sucedida
  await prisma.notaFiscal.update({
    where: { id: nota.id },
    data:  {
      enviadaClienteEm:    new Date(),
      enviadaClienteCanal: canal,
      atualizadoEm:        new Date(),
    },
  })
}

// ─── Entrega de documentos de cancelamento ────────────────────────────────────

export async function entregarDocumentoCancelamento(
  nota: {
    id: string
    clienteId: string
    numero: number | null
    valorTotal: unknown
    descricao: string
    tomadorNome?: string | null
    cliente: { nome: string; whatsapp: string | null; telefone: string | null; email: string | null }
  },
  spedyId: string,
  config: Awaited<ReturnType<typeof getEscritorioSpedy>>,
  spedyApiKey: string,
  canal: 'whatsapp' | 'email',
): Promise<void> {
  const spedyClient = getSpedyClienteClient({ spedyApiKey, spedyAmbiente: config.spedyAmbiente })
  const numero      = nota.numero ? `NFS-e-${nota.numero}` : 'NFS-e'
  const numeroExib  = nota.numero ? `nº ${nota.numero}` : ''

  // Busca PDF e XML de cancelamento (mesmo endpoint — conteúdo reflete o status atual)
  let pdfBuffer: Buffer | null = null
  let xmlBuffer: Buffer | null = null

  const [pdfRes, xmlRes] = await Promise.allSettled([
    fetch(spedyClient.pdfUrl(spedyId)),
    fetch(spedyClient.xmlUrl(spedyId)),
  ])
  if (pdfRes.status === 'fulfilled' && pdfRes.value.ok) {
    pdfBuffer = Buffer.from(await pdfRes.value.arrayBuffer())
  }
  if (xmlRes.status === 'fulfilled' && xmlRes.value.ok) {
    xmlBuffer = Buffer.from(await xmlRes.value.arrayBuffer())
  }

  const valor        = `R$ ${Number(nota.valorTotal).toFixed(2).replace('.', ',')}`
  const tomador      = nota.tomadorNome ? ` emitida para ${nota.tomadorNome}` : ''
  const primeiroNome = nota.cliente.nome.split(' ')[0]

  if (canal === 'whatsapp') {
    const whatsapp = nota.cliente.whatsapp ?? nota.cliente.telefone
    if (!whatsapp) return

    const apiKey = config.evolutionApiKey
      ? (isEncrypted(config.evolutionApiKey) ? decrypt(config.evolutionApiKey) : config.evolutionApiKey)
      : null
    if (!config.evolutionApiUrl || !apiKey || !config.evolutionInstance) return

    const evoCfg: EvolutionConfig = { baseUrl: config.evolutionApiUrl, apiKey, instance: config.evolutionInstance }
    const remoteJid = whatsapp.replace(/\D/g, '') + '@s.whatsapp.net'

    // Retry 3x com backoff — mesma estratégia de entregarNotaCliente
    const errosCancelamento: string[] = []

    for (let t = 1; t <= 3; t++) {
      try {
        await sendText(evoCfg, remoteJid,
          `🚫 *NFS-e ${numeroExib} cancelada*\n\nOlá, ${primeiroNome}! A Nota Fiscal de Serviço ${numeroExib}${tomador} (${valor}) foi cancelada com sucesso.\n\nSeguem o PDF e XML de cancelamento para seus registros.`,
        )
        break
      } catch (err) {
        if (t === 3) errosCancelamento.push(`texto: ${err instanceof Error ? err.message : String(err)}`)
        else await new Promise(r => setTimeout(r, 2000 * t))
      }
    }
    if (pdfBuffer) {
      for (let t = 1; t <= 3; t++) {
        try {
          await sendMedia(evoCfg, remoteJid, {
            mediatype: 'document', mimetype: 'application/pdf',
            fileName:  `${numero}-cancelamento.pdf`,
            caption:   `📄 PDF de cancelamento da ${numero}`,
            mediaBase64: pdfBuffer.toString('base64'),
          })
          break
        } catch (err) {
          if (t === 3) errosCancelamento.push(`pdf: ${err instanceof Error ? err.message : String(err)}`)
          else await new Promise(r => setTimeout(r, 2000 * t))
        }
      }
    }
    if (xmlBuffer) {
      for (let t = 1; t <= 3; t++) {
        try {
          await sendMedia(evoCfg, remoteJid, {
            mediatype: 'document', mimetype: 'application/xml',
            fileName:  `${numero}-cancelamento.xml`,
            caption:   `🗂️ XML de cancelamento da ${numero}`,
            mediaBase64: xmlBuffer.toString('base64'),
          })
          break
        } catch (err) {
          if (t === 3) errosCancelamento.push(`xml: ${err instanceof Error ? err.message : String(err)}`)
          else await new Promise(r => setTimeout(r, 2000 * t))
        }
      }
    }

    if (errosCancelamento.length > 0) {
      const motivo = errosCancelamento.join('; ')
      logger.error('nfse-entrega-cancelamento-whatsapp-falhou', { notaId: nota.id, motivo })
      Sentry.captureException(new Error(`Entrega cancelamento WhatsApp falhou: ${motivo}`), {
        tags:  { module: 'nfse-service', operation: 'entrega-cancelamento-whatsapp' },
        extra: { notaId: nota.id, motivo },
      })
      const { notificarEquipeEntregaFalhou } = await import('./notificacoes')
      await notificarEquipeEntregaFalhou(nota.id, nota.clienteId, 'whatsapp', `Documento de cancelamento: ${motivo}`)
    }

  } else if (canal === 'email') {
    const { sendEmail } = await import('@/lib/email/send')
    if (!nota.cliente.email) return

    const tomadorEmail = nota.tomadorNome ? ` emitida para <b>${nota.tomadorNome}</b>` : ''
    const anexos = [
      pdfBuffer && { nome: `${numero}-cancelamento.pdf`, content: pdfBuffer, mimeType: 'application/pdf' },
      xmlBuffer && { nome: `${numero}-cancelamento.xml`, content: xmlBuffer, mimeType: 'application/xml' },
    ].filter(Boolean) as { nome: string; content: Buffer; mimeType: string }[]

    await sendEmail({
      para:    nota.cliente.email,
      assunto: `NFS-e ${numeroExib} cancelada`,
      corpo:   `<p>Olá, ${primeiroNome}!</p><p>A Nota Fiscal de Serviço ${numeroExib}${tomadorEmail} no valor de <b>${valor}</b> foi <b>cancelada</b> com sucesso.</p><p>Seguem em anexo o PDF e o XML de cancelamento para seus registros.</p>`,
      anexos,
    })
  }
}
