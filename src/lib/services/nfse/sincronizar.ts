import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { getSpedyOwnerClient } from '@/lib/spedy'
import { logger } from '@/lib/logger'
import { getEscritorioSpedy } from './config'

// ─── Sincronização de empresa na Spedy ───────────────────────────────────────

function mapRegimeToSpedy(
  regime: string | null | undefined,
): 'simplesNacional' | 'simplesNacionalMEI' | 'simplesNacionalExcessoSublimite' | 'regimeNormal' {
  if (regime === 'MEI')             return 'simplesNacionalMEI'
  if (regime === 'SimplesNacional') return 'simplesNacional'
  return 'regimeNormal'
}

export async function sincronizarEmpresaNaSpedy(empresaId: string): Promise<{
  sucesso: boolean
  acao: 'criada' | 'atualizada' | 'noop'
  detalhe?: string
}> {
  const empresa = await prisma.empresa.findUnique({
    where:   { id: empresaId },
    include: { cliente: { select: { nome: true } } },
  })

  if (!empresa) return { sucesso: false, acao: 'noop', detalhe: 'Empresa não encontrada' }
  if (!empresa.cnpj) return { sucesso: false, acao: 'noop', detalhe: 'Empresa sem CNPJ cadastrado' }

  const escritorio = await prisma.escritorio.findFirst({
    select: { spedyApiKey: true, spedyAmbiente: true },
  })
  if (!escritorio?.spedyApiKey) {
    return { sucesso: false, acao: 'noop', detalhe: 'Conta Owner da Spedy não configurada' }
  }

  const ownerClient = getSpedyOwnerClient({
    spedyApiKey:   escritorio.spedyApiKey,
    spedyAmbiente: escritorio.spedyAmbiente,
  })

  const taxRegime = mapRegimeToSpedy(empresa.regime)
  const name      = empresa.nomeFantasia ?? empresa.razaoSocial ?? empresa.cliente?.nome ?? ''
  const legalName = empresa.razaoSocial  ?? empresa.cliente?.nome ?? ''
  const cnpj      = empresa.cnpj.replace(/\D/g, '')

  try {
    // Atualização: empresa já existe na Spedy
    if (empresa.spedyCompanyId) {
      await ownerClient.atualizarEmpresa(empresa.spedyCompanyId, { name, legalName, taxRegime })
      await prisma.empresa.update({
        where: { id: empresaId },
        data:  { spedyConfigurado: true, spedyConfiguradoEm: new Date() },
      })
      logger.info('spedy-empresa-atualizada', { empresaId, spedyCompanyId: empresa.spedyCompanyId })
      return { sucesso: true, acao: 'atualizada' }
    }

    // Criação: registra empresa na Spedy pela primeira vez
    const spedyEmpresa    = await ownerClient.criarEmpresa({ name, legalName, federalTaxNumber: cnpj, taxRegime })
    const apiKeyEncrypted = encrypt(spedyEmpresa.apiCredentials.apiKey)

    await prisma.empresa.update({
      where: { id: empresaId },
      data:  {
        spedyCompanyId:     spedyEmpresa.id,
        spedyApiKey:        apiKeyEncrypted,
        spedyConfigurado:   true,
        spedyConfiguradoEm: new Date(),
      },
    })
    logger.info('spedy-empresa-criada', { empresaId, spedyCompanyId: spedyEmpresa.id })
    return { sucesso: true, acao: 'criada' }

  } catch (err) {
    logger.error('spedy-sincronizar-empresa-falhou', { empresaId, err })
    Sentry.captureException(err, {
      tags:  { module: 'nfse-service', operation: 'sincronizar-empresa' },
      extra: { empresaId },
    })
    const detalhe = err instanceof Error ? err.message : 'Erro ao sincronizar com a Spedy'
    return { sucesso: false, acao: 'noop', detalhe }
  }
}
