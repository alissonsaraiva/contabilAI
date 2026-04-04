import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSpedyClienteClient, SpedyError } from '@/lib/spedy'
import { logger } from '@/lib/logger'
import { registrarTool } from './registry'
import type { Tool, ToolExecuteResult } from './types'

const reenviarEmailNotaFiscalTool: Tool = {
  definition: {
    name: 'reenviarEmailNotaFiscal',
    description:
      'Solicita à Spedy que reenvie o e-mail da NFS-e ao tomador (destinatário da nota). ' +
      'QUANDO USAR: tomador diz que não recebeu o e-mail da nota, pede reenvio do e-mail original da Spedy. ' +
      'DIFERENÇA de enviarNotaFiscalCliente: esta tool reenvia pelo canal da Spedy ao tomador da nota; ' +
      'enviarNotaFiscalCliente envia ao cliente (prestador) via WhatsApp/e-mail do escritório. ' +
      'LIMITAÇÃO: só funciona se a nota foi emitida com e-mail do tomador preenchido. ' +
      'Se o cliente quiser receber a nota por outro canal, use enviarNotaFiscalCliente.',
    inputSchema: {
      type: 'object',
      properties: {
        notaFiscalId: {
          type: 'string',
          description: 'ID interno da nota fiscal (campo id retornado por consultarNotasFiscais).',
        },
      },
      required: ['notaFiscalId'],
    },
  },

  meta: {
    label: 'Reenviar e-mail da NFS-e ao tomador',
    descricao: 'Solicita à Spedy que reenvie o e-mail da nota ao tomador. Requer que a nota tenha sido emitida com e-mail.',
    categoria: 'Nota Fiscal',
    canais: ['crm', 'whatsapp'],
  },

  async execute(input: Record<string, unknown>): Promise<ToolExecuteResult> {
    const parsed = z.object({
      notaFiscalId: z.string().min(1),
    }).safeParse(input)

    if (!parsed.success) {
      return { sucesso: false, erro: parsed.error.issues[0].message, resumo: 'ID da nota inválido.' }
    }

    const nota = await prisma.notaFiscal.findUnique({
      where:   { id: parsed.data.notaFiscalId },
      include: { empresa: { select: { spedyApiKey: true } } },
    })

    if (!nota) {
      return { sucesso: false, erro: 'Nota fiscal não encontrada.', resumo: 'Nota fiscal não encontrada.' }
    }
    if (nota.status !== 'autorizada') {
      return { sucesso: false, erro: 'Nota não autorizada.', resumo: `Reenvio de e-mail disponível apenas para notas autorizadas. Status atual: ${nota.status}.` }
    }
    if (!nota.spedyId) {
      return { sucesso: false, erro: 'Nota sem ID Spedy.', resumo: 'Nota sem identificador Spedy — não é possível reenviar.' }
    }
    if (!nota.tomadorEmail) {
      return {
        sucesso: false,
        erro:    'Nota sem e-mail do tomador.',
        resumo:  'Esta nota foi emitida sem e-mail do tomador, por isso o reenvio pelo canal da Spedy não está disponível. Use enviarNotaFiscalCliente para enviar via WhatsApp ou e-mail do escritório.',
      }
    }
    if (!nota.empresa?.spedyApiKey) {
      return { sucesso: false, erro: 'Empresa sem configuração Spedy.', resumo: 'Empresa sem chave Spedy configurada.' }
    }

    try {
      const escritorio = await prisma.escritorio.findFirst({ select: { spedyAmbiente: true } })
      const client = getSpedyClienteClient({
        spedyApiKey:   nota.empresa.spedyApiKey,
        spedyAmbiente: escritorio?.spedyAmbiente ?? null,
      })

      await client.reenviarEmailNfse(nota.spedyId)

      logger.info('nfse-reenviar-email-tool', { notaId: nota.id, spedyId: nota.spedyId })
      return {
        sucesso: true,
        dados:   { notaFiscalId: nota.id, tomadorEmail: nota.tomadorEmail },
        resumo:  `E-mail da NFS-e nº ${nota.numero ?? nota.id.slice(0, 8)} reenviado pela Spedy para ${nota.tomadorEmail}.`,
      }
    } catch (err) {
      logger.error('nfse-reenviar-email-tool-erro', { notaId: nota.id, err })
      Sentry.captureException(err, {
        tags:  { module: 'reenviar-email-nota-fiscal-tool', operation: 'reenviar' },
        extra: { notaId: nota.id },
      })
      const msg = err instanceof SpedyError ? err.message : 'Erro interno ao reenviar e-mail'
      return { sucesso: false, erro: msg, resumo: `Não foi possível reenviar o e-mail: ${msg}` }
    }
  },
}

registrarTool(reenviarEmailNotaFiscalTool)
