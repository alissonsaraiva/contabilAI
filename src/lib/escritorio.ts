import { prisma } from '@/lib/prisma'
import { cache } from 'react'

const FALLBACK = {
      id: 'singleton',
      nome: process.env.NEXT_PUBLIC_APP_NAME ?? 'Avos',
      nomeFantasia: null,
      logoUrl: null,
      faviconUrl: null,
      corPrimaria: '#6366f1',
      corSecundaria: '#8b5cf6',
      fraseBemVindo: 'Bem-vindo! Vamos cuidar da sua contabilidade.',
      metaDescricao: 'Contabilidade digital com IA.',
      cnpj: null,
      crc: null,
      email: null,
      telefone: null,
      whatsapp: null,
      cidade: null,
      uf: null,
      multaPercent: 2.0,
      jurosMesPercent: 1.0,
      diasAtrasoMulta: 15,
      diasInadimplenciaRescisao: 60,
      diasAvisoRescisao: 30,
      diasDocumentosAntecedencia: 5,
      vencimentosDias: [5, 10, 15, 20],
      pixDescontoPercent: 5.0,
      // Spedy — NFS-e
      spedyApiKey:            null as string | null,
      spedyAmbiente:          'sandbox' as string | null,
      spedyWebhookId:         null as string | null,
      spedyIssAliquota:       null as unknown,
      spedyIssWithheld:       false as boolean | null,
      spedyFederalServiceCode: null as string | null,
      spedyCityServiceCode:   null as string | null,
      spedyTaxationType:      null as string | null,
      spedyEnviarAoAutorizar: true as boolean | null,
      spedyEnviarCanalPadrao: 'whatsapp' as string | null,
}

export const getEscritorioConfig = cache(async () => {
  let escritorio: Awaited<ReturnType<typeof prisma.escritorio.findFirst>>
  try {
    escritorio = await prisma.escritorio.findFirst()
  } catch {
    return FALLBACK
  }
  if (!escritorio) {
    return {
      id: 'singleton',
      nome: process.env.NEXT_PUBLIC_APP_NAME ?? 'Avos',
      nomeFantasia: null,
      logoUrl: null,
      faviconUrl: null,
      corPrimaria: '#6366f1',
      corSecundaria: '#8b5cf6',
      fraseBemVindo: 'Bem-vindo! Vamos cuidar da sua contabilidade.',
      metaDescricao: 'Contabilidade digital com IA.',
      cnpj: null,
      crc: null,
      email: null,
      telefone: null,
      whatsapp: null,
      cidade: null,
      uf: null,
      multaPercent: 2.0,
      jurosMesPercent: 1.0,
      diasAtrasoMulta: 15,
      diasInadimplenciaRescisao: 60,
      diasAvisoRescisao: 30,
      diasDocumentosAntecedencia: 5,
      vencimentosDias: [5, 10, 15, 20],
      pixDescontoPercent: 5.0,
      spedyApiKey:            null as string | null,
      spedyAmbiente:          'sandbox' as string | null,
      spedyWebhookId:         null as string | null,
      spedyIssAliquota:       null as unknown,
      spedyIssWithheld:       false as boolean | null,
      spedyFederalServiceCode: null as string | null,
      spedyCityServiceCode:   null as string | null,
      spedyTaxationType:      null as string | null,
      spedyEnviarAoAutorizar: true as boolean | null,
      spedyEnviarCanalPadrao: 'whatsapp' as string | null,
    }
  }
  return escritorio
})
