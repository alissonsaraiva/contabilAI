import { prisma } from '@/lib/prisma'
import { cache } from 'react'

export const getEscritorioConfig = cache(async () => {
  const escritorio = await prisma.escritorio.findFirst()
  if (!escritorio) {
    return {
      id: 'singleton',
      nome: process.env.NEXT_PUBLIC_APP_NAME ?? 'ContabAI',
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
    }
  }
  return escritorio
})
