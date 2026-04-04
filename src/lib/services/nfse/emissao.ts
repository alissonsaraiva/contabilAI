import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { getSpedyClienteClient, SpedyError, type EmissaoNfseInput } from '@/lib/spedy'
import { logger } from '@/lib/logger'
import type { StatusNotaFiscal } from '@prisma/client'
import { getEscritorioSpedy } from './config'
import { soNumeros, getClienteComEmpresa, getClienteSpedyKey } from './helpers'
import type { EmitirNotaInput, EmitirNotaOutput, EmitirNotaErro } from './tipos'
import { onNotaAutorizada } from './eventos'

// ─── Emissão ──────────────────────────────────────────────────────────────────

export async function emitirNotaFiscal(input: EmitirNotaInput): Promise<EmitirNotaOutput> {
  const { clienteId, ordemServicoId, descricao, valor, tomadorNome, tomadorCpfCnpj } = input

  // 1. Busca cliente + empresa
  const cliente = await getClienteComEmpresa(clienteId)
  if (!cliente) {
    return { sucesso: false, motivo: 'dados_incompletos', detalhe: 'Cliente não encontrado.' }
  }

  const empresa = cliente.empresa
  if (!empresa?.spedyConfigurado || !empresa?.spedyApiKey) {
    return {
      sucesso: false,
      motivo:  'nao_configurado',
      detalhe: `Empresa "${empresa?.razaoSocial ?? cliente.nome}" não está configurada para emissão de NFS-e. Acesse Configurações > Nota Fiscal para configurar.`,
    }
  }

  // 2. Busca config do escritório para defaults
  const config = await getEscritorioSpedy()

  // 3. Resolve defaults fiscais (empresa > escritório)
  // Nota: Number(null) = 0 (falsy mas não nullish) — precisa de verificação explícita antes de converter
  const issAliquota        = input.issAliquota
    ?? (empresa.spedyIssAliquota != null ? Number(empresa.spedyIssAliquota) : null)
    ?? (config.spedyIssAliquota  != null ? Number(config.spedyIssAliquota)  : null)
    ?? 0.05
  const issRetido          = input.issRetido         ?? empresa.spedyIssWithheld             ?? config.spedyIssWithheld            ?? false
  const federalServiceCode = input.federalServiceCode ?? empresa.spedyFederalServiceCode    ?? config.spedyFederalServiceCode     ?? ''
  const cityServiceCode    = input.cityServiceCode    ?? empresa.spedyCityServiceCode        ?? config.spedyCityServiceCode        ?? ''
  const taxationType       = input.taxationType       ?? empresa.spedyTaxationType           ?? config.spedyTaxationType           ?? 'taxationInMunicipality'

  const cpfCnpjLimpo = soNumeros(tomadorCpfCnpj)
  const issValor     = Math.round(valor * issAliquota * 100) / 100
  const valorLiquido = issRetido ? Math.round((valor - issValor) * 100) / 100 : valor

  // 4. Cria registro local — integrationId sempre único para não colidir com reemissões
  const integrationId = `nf-${clienteId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const notaLocal = await prisma.notaFiscal.create({
    data: {
      clienteId,
      empresaId:        empresa.id,
      ordemServicoId:   ordemServicoId ?? null,
      emitidaPorId:     input.emitidaPorId ?? null,
      integrationId,
      status:           'enviando',
      descricao,
      valorTotal:       valor,
      issRetido,
      issAliquota,
      issValor:         issValor > 0 ? issValor : null,
      valorLiquido,
      federalServiceCode,
      cityServiceCode,
      taxationType,
      tomadorNome,
      tomadorCpfCnpj:   cpfCnpjLimpo,
      tomadorEmail:     input.tomadorEmail    ?? null,
      tomadorMunicipio: input.tomadorMunicipio ?? null,
      tomadorEstado:    input.tomadorEstado   ?? null,
      atualizadoEm:     new Date(),
    },
  })

  // 5. Monta payload e emite na Spedy
  try {
    const spedyKey    = getClienteSpedyKey(empresa)!
    const ambiente    = config.spedyAmbiente === 'producao' ? 'producao' : 'sandbox'
    const spedyClient = getSpedyClienteClient({ spedyApiKey: spedyKey, spedyAmbiente: ambiente })

    const payload: EmissaoNfseInput = {
      integrationId,
      effectiveDate:        new Date().toISOString(),
      status:               'enqueued',
      sendEmailToCustomer:  !!input.tomadorEmail,
      description:          descricao,
      federalServiceCode:   federalServiceCode || undefined,
      cityServiceCode:      cityServiceCode    || undefined,
      taxationType,
      receiver: {
        name:             tomadorNome,
        federalTaxNumber: cpfCnpjLimpo,
        email:            input.tomadorEmail,
        address: (input.tomadorMunicipio && input.tomadorEstado) ? {
          city: { name: input.tomadorMunicipio, state: input.tomadorEstado },
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

    // 6. Atualiza com ID da Spedy e status
    const statusMapeado: StatusNotaFiscal =
      nfse.status === 'authorized' ? 'autorizada'
      : nfse.status === 'rejected' ? 'rejeitada'
      : nfse.status === 'canceled' ? 'cancelada'
      : 'processando'

    // Monta update com campos base + campos de autorização se já autorizado sincronamente
    const updateComSpedy: Record<string, unknown> = {
      spedyId:      nfse.id,
      status:       statusMapeado,
      rpsNumero:    nfse.rps?.number || null,
      rpsSerie:     nfse.rps?.series || null,
      atualizadoEm: new Date(),
    }
    if (statusMapeado === 'autorizada') {
      // Autorização síncrona — preenche campos que normalmente chegam via webhook
      updateComSpedy.numero      = nfse.number ?? null
      updateComSpedy.protocolo   = nfse.authorization?.protocol ?? null
      updateComSpedy.autorizadaEm = nfse.authorization?.date
        ? new Date(nfse.authorization.date)
        : new Date()
    }

    await prisma.notaFiscal.update({
      where: { id: notaLocal.id },
      data:  updateComSpedy as never,
    })

    // Se já autorizado de forma síncrona (raro), processa imediatamente
    if (statusMapeado === 'autorizada') {
      await onNotaAutorizada({
        ...notaLocal,
        spedyId:     nfse.id,
        numero:      nfse.number ?? null,
        protocolo:   nfse.authorization?.protocol ?? null,
        autorizadaEm: updateComSpedy.autorizadaEm as Date,
      })
    }

    return {
      sucesso:      true,
      notaFiscalId: notaLocal.id,
      status:       statusMapeado,
      mensagem:     `NFS-e enviada para processamento. ${nfse.rps ? `RPS nº ${nfse.rps.number}.` : ''} Aguardando autorização da prefeitura.`,
    }

  } catch (err) {
    logger.error('spedy-emissao-falhou', { notaId: notaLocal.id, err })
    Sentry.captureException(err, {
      tags:  { module: 'nfse-service', operation: 'emitir' },
      extra: { notaId: notaLocal.id, clienteId, integrationId },
    })

    const msg    = err instanceof SpedyError ? err.message : 'Erro interno ao comunicar com a Spedy'
    const motivo: EmitirNotaErro['motivo'] = err instanceof SpedyError ? 'erro_spedy' : 'erro_interno'

    await prisma.notaFiscal.update({
      where: { id: notaLocal.id },
      data:  { status: 'erro_interno', erroMensagem: msg, tentativas: 1, atualizadoEm: new Date() },
    })

    return { sucesso: false, motivo, detalhe: msg }
  }
}
