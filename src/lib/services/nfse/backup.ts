import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { getSpedyClienteClient } from '@/lib/spedy'
import { uploadArquivo, getDownloadUrl, storageKeys } from '@/lib/storage'
import { logger } from '@/lib/logger'
import { getEscritorioSpedy } from './config'

// ─── Backup local de PDF+XML no R2 ────────────────────────────────────────────

/**
 * Baixa PDF e XML da Spedy e salva cópias no R2.
 * Chamado imediatamente ao autorizar a nota — garante disponibilidade
 * mesmo que a Spedy fique indisponível posteriormente.
 */
export async function salvarPdfXmlNoR2(nota: {
  id: string
  clienteId: string
  spedyId: string
}): Promise<void> {
  const notaComEmpresa = await prisma.notaFiscal.findUnique({
    where:   { id: nota.id },
    include: { empresa: { select: { spedyApiKey: true } } },
  })

  const spedyApiKey = notaComEmpresa?.empresa?.spedyApiKey
  if (!spedyApiKey) {
    logger.warn('nfse-r2-sem-spedy-key', { notaId: nota.id })
    return
  }

  const config     = await getEscritorioSpedy()
  const spedyClient = getSpedyClienteClient({ spedyApiKey, spedyAmbiente: config.spedyAmbiente })

  const [pdfRes, xmlRes] = await Promise.allSettled([
    fetch(spedyClient.pdfUrl(nota.spedyId)),
    fetch(spedyClient.xmlUrl(nota.spedyId)),
  ])

  const updates: Partial<{ pdfUrl: string; xmlUrl: string }> = {}

  if (pdfRes.status === 'fulfilled' && pdfRes.value.ok) {
    const buf = Buffer.from(await pdfRes.value.arrayBuffer())
    const key = storageKeys.notaFiscalPdf(nota.clienteId, nota.id)
    try {
      await uploadArquivo(key, buf, 'application/pdf')
      updates.pdfUrl = key
    } catch (uploadErr) {
      logger.error('nfse-r2-upload-pdf-falhou', { notaId: nota.id, uploadErr })
      Sentry.captureException(uploadErr, {
        tags:  { module: 'nfse-backup', operation: 'upload-pdf' },
        extra: { notaId: nota.id },
      })
    }
  } else {
    logger.warn('nfse-r2-pdf-indisponivel', {
      notaId: nota.id,
      status: pdfRes.status === 'fulfilled' ? pdfRes.value.status : 'network-error',
    })
    Sentry.captureMessage('nfse-r2-pdf-indisponivel', {
      level: 'warning',
      tags:  { module: 'nfse-backup', operation: 'fetch-pdf' },
      extra: { notaId: nota.id, status: pdfRes.status === 'fulfilled' ? pdfRes.value.status : 'network-error' },
    })
  }

  if (xmlRes.status === 'fulfilled' && xmlRes.value.ok) {
    const buf = Buffer.from(await xmlRes.value.arrayBuffer())
    const key = storageKeys.notaFiscalXml(nota.clienteId, nota.id)
    try {
      await uploadArquivo(key, buf, 'application/xml')
      updates.xmlUrl = key
    } catch (uploadErr) {
      logger.error('nfse-r2-upload-xml-falhou', { notaId: nota.id, uploadErr })
      Sentry.captureException(uploadErr, {
        tags:  { module: 'nfse-backup', operation: 'upload-xml' },
        extra: { notaId: nota.id },
      })
    }
  } else {
    logger.warn('nfse-r2-xml-indisponivel', {
      notaId: nota.id,
      status: xmlRes.status === 'fulfilled' ? xmlRes.value.status : 'network-error',
    })
    Sentry.captureMessage('nfse-r2-xml-indisponivel', {
      level: 'warning',
      tags:  { module: 'nfse-backup', operation: 'fetch-xml' },
      extra: { notaId: nota.id, status: xmlRes.status === 'fulfilled' ? xmlRes.value.status : 'network-error' },
    })
  }

  if (Object.keys(updates).length > 0) {
    await prisma.notaFiscal.update({
      where: { id: nota.id },
      data:  { ...updates, atualizadoEm: new Date() },
    })
    logger.info('nfse-r2-backup-salvo', { notaId: nota.id, arquivos: Object.keys(updates) })
  }
}

/**
 * Busca PDF e XML no R2 (cópia local) com fallback para a Spedy.
 * Usada por entregarNotaCliente e entregarDocumentoCancelamento.
 */
export async function buscarPdfXml(nota: {
  id: string
  pdfUrl: string | null
  xmlUrl: string | null
  spedyId: string | null
  empresa: { spedyApiKey: string | null } | null
}): Promise<{ pdfBuffer: Buffer | null; xmlBuffer: Buffer | null }> {
  let pdfBuffer: Buffer | null = null
  let xmlBuffer: Buffer | null = null

  // 1ª tentativa: R2 (cópia salva ao autorizar — mais resiliente)
  const pdfKey = nota.pdfUrl && !nota.pdfUrl.startsWith('https://') ? nota.pdfUrl : null
  const xmlKey = nota.xmlUrl && !nota.xmlUrl.startsWith('https://') ? nota.xmlUrl : null

  const [r2PdfRes, r2XmlRes] = await Promise.allSettled([
    pdfKey ? getDownloadUrl(pdfKey).then(url => fetch(url)) : Promise.reject(new Error('sem-r2-pdf')),
    xmlKey ? getDownloadUrl(xmlKey).then(url => fetch(url)) : Promise.reject(new Error('sem-r2-xml')),
  ])

  if (r2PdfRes.status === 'fulfilled' && r2PdfRes.value.ok) {
    pdfBuffer = Buffer.from(await r2PdfRes.value.arrayBuffer())
  }
  if (r2XmlRes.status === 'fulfilled' && r2XmlRes.value.ok) {
    xmlBuffer = Buffer.from(await r2XmlRes.value.arrayBuffer())
  }

  // 2ª tentativa: Spedy para o que não veio do R2
  if ((!pdfBuffer || !xmlBuffer) && nota.empresa?.spedyApiKey && nota.spedyId) {
    const config     = await getEscritorioSpedy()
    const spedyClient = getSpedyClienteClient({
      spedyApiKey:   nota.empresa.spedyApiKey,
      spedyAmbiente: config.spedyAmbiente,
    })
    const [pdfRes, xmlRes] = await Promise.allSettled([
      !pdfBuffer ? fetch(spedyClient.pdfUrl(nota.spedyId)) : Promise.resolve(null as unknown as Response),
      !xmlBuffer ? fetch(spedyClient.xmlUrl(nota.spedyId)) : Promise.resolve(null as unknown as Response),
    ])
    if (!pdfBuffer && pdfRes.status === 'fulfilled' && pdfRes.value?.ok) {
      pdfBuffer = Buffer.from(await pdfRes.value.arrayBuffer())
    } else if (!pdfBuffer) {
      logger.warn('nfse-entrega-pdf-indisponivel', { notaId: nota.id })
    }
    if (!xmlBuffer && xmlRes.status === 'fulfilled' && xmlRes.value?.ok) {
      xmlBuffer = Buffer.from(await xmlRes.value.arrayBuffer())
    } else if (!xmlBuffer) {
      logger.warn('nfse-entrega-xml-indisponivel', { notaId: nota.id })
    }
  }

  return { pdfBuffer, xmlBuffer }
}
