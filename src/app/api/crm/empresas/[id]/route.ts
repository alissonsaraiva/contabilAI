import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { sincronizarEmpresaNaSpedy } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  // Captura estado anterior para detectar mudanças relevantes para a Spedy
  const anterior = await prisma.empresa.findUnique({
    where:  { id },
    select: { cnpj: true, razaoSocial: true, nomeFantasia: true, regime: true, spedyConfigurado: true, spedyCompanyId: true },
  })

  const empresa = await prisma.empresa.update({
    where: { id },
    data: {
      cnpj:         body.cnpj         || null,
      razaoSocial:  body.razaoSocial  || null,
      nomeFantasia: body.nomeFantasia  || null,
      regime:       body.regime       || null,
      status:       body.status       || undefined,
    },
    include: { cliente: true, socios: true },
  })

  indexarAsync('empresa', {
    id:           empresa.id,
    cnpj:         empresa.cnpj,
    razaoSocial:  empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    regime:       empresa.regime,
    status:       empresa.status,
    socios:       empresa.socios,
  })

  // Sincroniza com a Spedy quando dados relevantes mudam e empresa tem CNPJ
  const cnpjNovo       = (body.cnpj         || null) as string | null
  const regimeNovo     = (body.regime       || null) as string | null
  const razaoNova      = (body.razaoSocial  || null) as string | null
  const nomeNovo       = (body.nomeFantasia  || null) as string | null

  const dadosMudaram =
    cnpjNovo   !== anterior?.cnpj        ||
    regimeNovo !== anterior?.regime      ||
    razaoNova  !== anterior?.razaoSocial ||
    nomeNovo   !== anterior?.nomeFantasia

  if (cnpjNovo && dadosMudaram) {
    sincronizarEmpresaNaSpedy(empresa.id).catch(err => {
      logger.error('empresa-patch-spedy-sync-falhou', { empresaId: empresa.id, err })
      Sentry.captureException(err, { tags: { module: 'crm-empresas', operation: 'spedy-sync' }, extra: { empresaId: empresa.id } })
    })
  }

  return NextResponse.json(empresa)
}
