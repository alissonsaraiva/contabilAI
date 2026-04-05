import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { getSpedyClienteClient, SpedyError } from '@/lib/spedy'
import { registrarInteracao } from '@/lib/services/interacoes'
import { logger } from '@/lib/logger'
import { getEscritorioSpedy } from './config'
import { entregarDocumentoCancelamento } from './entrega'

// ─── Cancelamento ─────────────────────────────────────────────────────────────

export async function cancelarNotaFiscal(
  notaFiscalId: string,
  justificativa: string,
  entregarApos?: 'whatsapp' | 'email',
): Promise<{ sucesso: boolean; detalhe?: string }> {
  const nota = await prisma.notaFiscal.findUnique({
    where:   { id: notaFiscalId },
    include: { empresa: true, cliente: true },
  })

  if (!nota) return { sucesso: false, detalhe: 'Nota fiscal não encontrada.' }
  if (nota.status !== 'autorizada') return { sucesso: false, detalhe: `Apenas notas autorizadas podem ser canceladas. Status atual: ${nota.status}` }
  if (!nota.spedyId) return { sucesso: false, detalhe: 'Nota sem ID Spedy — não pode ser cancelada pela API.' }

  // Aviso de prazo legal — maioria dos municípios permite cancelamento apenas nos primeiros 30 dias
  if (nota.autorizadaEm) {
    const diasDesdeAutorizacao = Math.floor((Date.now() - nota.autorizadaEm.getTime()) / 86_400_000)
    if (diasDesdeAutorizacao > 30) {
      logger.warn('nfse-cancelamento-fora-prazo', { notaId: nota.id, diasDesdeAutorizacao })
      // Não bloqueia — a Spedy ou a prefeitura fará a validação definitiva; apenas loga
    }
  }

  const empresa = nota.empresa
  if (!empresa?.spedyApiKey) return { sucesso: false, detalhe: 'Empresa não configurada na Spedy.' }

  const config = await getEscritorioSpedy()

  try {
    const spedyClient = getSpedyClienteClient({
      spedyApiKey:   empresa.spedyApiKey,
      spedyAmbiente: config.spedyAmbiente,
    })

    await spedyClient.cancelarNfse(nota.spedyId, justificativa)

    const notaAtualizada = await prisma.notaFiscal.update({
      where: { id: nota.id },
      data:  {
        status:                    'cancelada',
        canceladaEm:               new Date(),
        cancelamentoJustificativa: justificativa,
        atualizadoEm:              new Date(),
      },
    })

    const numero = nota.numero ? `nº ${nota.numero}` : `(${nota.id.slice(0, 8)})`

    await registrarInteracao({
      clienteId: nota.clienteId,
      tipo:      'nota_fiscal_cancelada',
      origem:    'sistema',
      titulo:    `NFS-e ${numero} cancelada`,
      conteudo:  `Nota Fiscal cancelada. Justificativa: ${justificativa}. Valor: R$ ${Number(nota.valorTotal).toFixed(2)}.`,
      metadados: { notaFiscalId: nota.id },
      escritorioEvento: true,
    }).catch(err => logger.warn('nfse-cancelamento-interacao-falhou', { notaId: nota.id, err }))

    // Re-indexa no RAG com status "cancelada" — garante que as IAs saibam do cancelamento
    import('@/lib/rag/ingest-nota-fiscal').then(({ indexar }) =>
      indexar({
        id:          nota.id,
        clienteId:   nota.clienteId,
        numero:      nota.numero,
        valorTotal:  nota.valorTotal,
        descricao:   nota.descricao,
        status:      'cancelada',
        canceladaEm: notaAtualizada.canceladaEm,
        protocolo:   nota.protocolo,
      }, nota.cliente?.nome)
    ).catch(err => logger.warn('nfse-cancelamento-rag-falhou', { notaId: nota.id, err }))

    // Entrega PDF+XML de cancelamento ao cliente se solicitado
    if (entregarApos) {
      await entregarDocumentoCancelamento(
        { ...notaAtualizada, cliente: nota.cliente },
        nota.spedyId,
        config,
        empresa.spedyApiKey,
        entregarApos,
      ).catch(err => logger.warn('nfse-entrega-cancelamento-falhou', { notaId: nota.id, err }))
    }

    return { sucesso: true }

  } catch (err) {
    logger.error('spedy-cancelamento-falhou', { notaId: nota.id, err })
    Sentry.captureException(err, {
      tags:  { module: 'nfse-service', operation: 'cancelar' },
      extra: { notaId: nota.id },
    })
    const msg = err instanceof SpedyError ? err.message : 'Erro ao cancelar na Spedy'
    return { sucesso: false, detalhe: msg }
  }
}
