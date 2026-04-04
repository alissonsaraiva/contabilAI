import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { getSpedyClienteClient, SpedyError, type EmissaoNfseInput } from '@/lib/spedy'
import { logger } from '@/lib/logger'
import type { StatusNotaFiscal } from '@prisma/client'
import { getEscritorioSpedy } from './config'
import { soNumeros, getClienteSpedyKey } from './helpers'
import type { EmitirNotaInput, EmitirNotaOutput } from './tipos'
import { onNotaAutorizada } from './eventos'

// ─── Reemissão (corrigir rejeitada) ──────────────────────────────────────────
//
// Diferença fundamental em relação a emitirNotaFiscal:
//   • Não cria um novo registro local — atualiza o EXISTENTE
//   • Mantém o mesmo notaFiscalId no histórico do cliente
//   • Evita notas "rejeitada" órfãs ao lado de novas "processando"

export async function reemitirNotaFiscal(
  notaFiscalId: string,
  overrides?: Partial<EmitirNotaInput>,
): Promise<EmitirNotaOutput> {
  const nota = await prisma.notaFiscal.findUnique({
    where:   { id: notaFiscalId },
    include: { empresa: true },
  })

  if (!nota) return { sucesso: false, motivo: 'dados_incompletos', detalhe: 'Nota não encontrada.' }
  if (nota.status !== 'rejeitada' && nota.status !== 'erro_interno') {
    return {
      sucesso: false,
      motivo:  'dados_incompletos',
      detalhe: `Só é possível reemitir notas rejeitadas. Status atual: ${nota.status}`,
    }
  }

  const empresa = nota.empresa
  if (!empresa?.spedyApiKey) {
    return { sucesso: false, motivo: 'nao_configurado', detalhe: 'Empresa não configurada na Spedy.' }
  }

  const config = await getEscritorioSpedy()

  // Monta dados finais: overrides sobre originais
  const descricao          = overrides?.descricao          ?? nota.descricao
  const valor              = overrides?.valor              ?? Number(nota.valorTotal)
  const tomadorNome        = overrides?.tomadorNome        ?? nota.tomadorNome ?? ''
  const tomadorCpfCnpj     = overrides?.tomadorCpfCnpj    ?? nota.tomadorCpfCnpj ?? ''
  const tomadorEmail       = overrides?.tomadorEmail       ?? nota.tomadorEmail   ?? undefined
  const tomadorMunicipio   = overrides?.tomadorMunicipio   ?? nota.tomadorMunicipio ?? undefined
  const tomadorEstado      = overrides?.tomadorEstado      ?? nota.tomadorEstado    ?? undefined
  // Nota: Number(null) = 0 — verificar explicitamente antes de converter
  const issAliquota        = overrides?.issAliquota
    ?? (nota.issAliquota != null ? Number(nota.issAliquota) : null)
    ?? 0.05
  const issRetido          = overrides?.issRetido          ?? nota.issRetido
  const federalServiceCode = overrides?.federalServiceCode ?? nota.federalServiceCode ?? undefined
  const cityServiceCode    = overrides?.cityServiceCode    ?? nota.cityServiceCode    ?? undefined
  const taxationType       = overrides?.taxationType       ?? nota.taxationType       ?? 'taxationInMunicipality'

  const cpfCnpjLimpo = soNumeros(tomadorCpfCnpj)
  const issValor     = Math.round(valor * issAliquota * 100) / 100
  const valorLiquido = issRetido ? Math.round((valor - issValor) * 100) / 100 : valor

  // Novo integrationId — Spedy cria uma nova entrada; o ID local permanece o mesmo
  const novoIntegrationId = `nf-${nota.clienteId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // Atualiza o registro EXISTENTE com dados corrigidos e reseta o status para 'enviando'
  await prisma.notaFiscal.update({
    where: { id: nota.id },
    data: {
      status:            'enviando',
      integrationId:     novoIntegrationId,
      descricao,
      valorTotal:        valor,
      issAliquota,
      issRetido,
      issValor:          issValor > 0 ? issValor : null,
      valorLiquido,
      federalServiceCode: federalServiceCode ?? null,
      cityServiceCode:    cityServiceCode    ?? null,
      taxationType,
      tomadorNome,
      tomadorCpfCnpj:    cpfCnpjLimpo,
      tomadorEmail:      tomadorEmail    ?? null,
      tomadorMunicipio:  tomadorMunicipio ?? null,
      tomadorEstado:     tomadorEstado   ?? null,
      erroCodigo:        null,
      erroMensagem:      null,
      spedyId:           null,    // será preenchido com o novo ID da Spedy
      numero:            null,
      protocolo:         null,
      autorizadaEm:      null,
      emitidaPorId:      overrides?.emitidaPorId ?? nota.emitidaPorId,
      atualizadoEm:      new Date(),
    },
  })

  try {
    const spedyKey    = getClienteSpedyKey(empresa)!
    const ambiente    = config.spedyAmbiente === 'producao' ? 'producao' : 'sandbox'
    const spedyClient = getSpedyClienteClient({ spedyApiKey: spedyKey, spedyAmbiente: ambiente })

    const payload: EmissaoNfseInput = {
      integrationId:       novoIntegrationId,
      effectiveDate:       new Date().toISOString(),
      status:              'enqueued',
      sendEmailToCustomer: !!tomadorEmail,
      description:         descricao,
      federalServiceCode:  federalServiceCode || undefined,
      cityServiceCode:     cityServiceCode    || undefined,
      taxationType,
      receiver: {
        name:             tomadorNome,
        federalTaxNumber: cpfCnpjLimpo,
        email:            tomadorEmail,
        address: (tomadorMunicipio && tomadorEstado) ? {
          city: { name: tomadorMunicipio, state: tomadorEstado },
        } : undefined,
      },
      total: {
        invoiceAmount: valor,
        issRate:       issAliquota,
        issAmount:     issValor > 0 ? issValor : undefined,
        issWithheld:   issRetido,
        netAmount:     valorLiquido !== valor ? valorLiquido : undefined,
      },
    }

    const nfse = await spedyClient.emitirNfse(payload)

    const statusMapeado: StatusNotaFiscal =
      nfse.status === 'authorized' ? 'autorizada'
      : nfse.status === 'rejected'  ? 'rejeitada'
      : nfse.status === 'canceled'  ? 'cancelada'
      : 'processando'

    const updateComSpedy: Record<string, unknown> = {
      spedyId:      nfse.id,
      status:       statusMapeado,
      rpsNumero:    nfse.rps?.number || null,
      rpsSerie:     nfse.rps?.series || null,
      tentativas:   (nota.tentativas ?? 0) + 1,
      atualizadoEm: new Date(),
    }

    if (statusMapeado === 'autorizada') {
      updateComSpedy.numero      = nfse.number ?? null
      updateComSpedy.protocolo   = nfse.authorization?.protocol ?? null
      updateComSpedy.autorizadaEm = nfse.authorization?.date
        ? new Date(nfse.authorization.date)
        : new Date()
    }

    await prisma.notaFiscal.update({
      where: { id: nota.id },
      data:  updateComSpedy as never,
    })

    if (statusMapeado === 'autorizada') {
      await onNotaAutorizada({
        id:          nota.id,
        clienteId:   nota.clienteId,
        empresaId:   nota.empresaId,
        ordemServicoId: nota.ordemServicoId,
        spedyId:     nfse.id,
        numero:      nfse.number ?? null,
        valorTotal:  valor,
        descricao,
        tomadorNome,
        protocolo:   nfse.authorization?.protocol ?? null,
        autorizadaEm: updateComSpedy.autorizadaEm as Date,
        issValor:    issValor > 0 ? issValor : null,
        issRetido,
      })
    }

    return {
      sucesso:      true,
      notaFiscalId: nota.id,
      status:       statusMapeado,
      mensagem:     `NFS-e reemitida para processamento. ${nfse.rps ? `RPS nº ${nfse.rps.number}.` : ''} Aguardando autorização da prefeitura.`,
    }

  } catch (err) {
    logger.error('spedy-reemissao-falhou', { notaId: nota.id, err })
    Sentry.captureException(err, {
      tags:  { module: 'nfse-service', operation: 'reemitir' },
      extra: { notaId: nota.id },
    })

    const msg    = err instanceof SpedyError ? err.message : 'Erro interno ao comunicar com a Spedy'
    const motivo: 'erro_spedy' | 'erro_interno' = err instanceof SpedyError ? 'erro_spedy' : 'erro_interno'

    await prisma.notaFiscal.update({
      where: { id: nota.id },
      data:  {
        status:       'erro_interno',
        erroMensagem: msg,
        tentativas:   (nota.tentativas ?? 0) + 1,
        atualizadoEm: new Date(),
      },
    })

    return { sucesso: false, motivo, detalhe: msg }
  }
}
