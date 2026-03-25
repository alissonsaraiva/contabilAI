import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { uploadArquivo, storageKeys } from '@/lib/storage'
import { ContratoPDF } from '@/lib/pdf/contrato-template'
import React from 'react'
import type { PlanoTipo, FormaPagamento } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

const PLANO_PRECOS: Record<string, number> = {
  essencial: 199,
  profissional: 499,
  empresarial: 1200,
  startup: 1500,
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  const { assinatura } = await req.json() as { assinatura: string }

  if (!assinatura?.trim()) {
    return NextResponse.json({ error: 'Assinatura obrigatória' }, { status: 400 })
  }

  const [lead, escritorio] = await Promise.all([
    prisma.lead.findUnique({ where: { id } }),
    prisma.escritorio.findFirst(),
  ])

  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const dados = lead.dadosJson as Record<string, string> | null
  const plano = lead.planoTipo ?? 'essencial'
  const vencimento = lead.vencimentoDia ?? 10
  const formaPagamento = lead.formaPagamento ?? 'pix'
  const valor = PLANO_PRECOS[plano] ?? 199
  const agora = new Date()

  const pdfElement = React.createElement(ContratoPDF, {
    nome: dados?.['Nome completo'] ?? lead.contatoEntrada,
    cpf: dados?.['CPF'] ?? '',
    email: dados?.['E-mail'] ?? lead.contatoEntrada,
    telefone: dados?.['Telefone'] ?? lead.contatoEntrada,
    cnpj: dados?.['CNPJ'],
    razaoSocial: dados?.['Razão Social'],
    cidade: dados?.['Cidade'],
    plano,
    valor,
    vencimentoDia: vencimento,
    formaPagamento,
    assinadoEm: agora,
    assinatura: assinatura.trim(),
    escritorioNome: escritorio?.nome ?? 'ContabAI',
    escritorioCnpj: escritorio?.cnpj,
    escritorioCrc: escritorio?.crc,
    escritorioCidade: escritorio?.cidade,
  // @react-pdf/renderer types require DocumentProps but ContratoPDF wraps Document internally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  const pdfBuffer = await renderToBuffer(pdfElement)

  const key = storageKeys.contratoLead(id)
  const pdfUrl = await uploadArquivo(key, pdfBuffer, 'application/pdf')

  const contrato = await prisma.contrato.upsert({
    where: { leadId: id },
    create: {
      leadId: id,
      planoTipo: plano as PlanoTipo,
      valorMensal: valor,
      vencimentoDia: vencimento,
      formaPagamento: formaPagamento as FormaPagamento,
      status: 'assinado',
      pdfUrl,
      dadosSnapshot: {
        ...dados,
        assinatura: assinatura.trim(),
        assinadoEm: agora.toISOString(),
      },
      geradoEm: agora,
      assinadoEm: agora,
    },
    update: {
      status: 'assinado',
      pdfUrl,
      assinadoEm: agora,
      dadosSnapshot: {
        ...dados,
        assinatura: assinatura.trim(),
        assinadoEm: agora.toISOString(),
      },
    },
  })

  await prisma.lead.update({
    where: { id },
    data: { status: 'assinado', stepAtual: 6 },
  })

  return NextResponse.json({ ok: true, pdfUrl, contratoId: contrato.id })
}
