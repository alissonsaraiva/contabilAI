import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ContratoPDF } from '@/lib/pdf/contrato-template'
import { enviarContratoParaAssinatura, zapsignConfigurado } from '@/lib/zapsign'
import React from 'react'
import type { PlanoTipo, FormaPagamento } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

const PLANO_PRECOS_FALLBACK: Record<string, number> = {
  essencial: 199,
  profissional: 499,
  empresarial: 1200,
  startup: 1500,
}

export async function POST(_req: Request, { params }: Params) {
  // Rota acessível do onboarding público (sem auth) e do CRM (com auth)
  // Segurança: leadId é UUID — difícil de adivinhar. Consistente com /contrato (POST).

  if (!zapsignConfigurado()) {
    return NextResponse.json(
      { error: 'ZapSign não configurado. Defina ZAPSIGN_API_TOKEN no .env.' },
      { status: 503 },
    )
  }

  const { id } = await params
  const [lead, escritorio] = await Promise.all([
    prisma.lead.findUnique({ where: { id } }),
    prisma.escritorio.findFirst(),
  ])

  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const dados = lead.dadosJson as Record<string, string> | null
  const nome = dados?.['Nome completo'] ?? lead.contatoEntrada
  const email = dados?.['E-mail']

  if (!email || !email.includes('@')) {
    return NextResponse.json(
      { error: 'E-mail do lead não encontrado. Preencha o campo E-mail no onboarding.' },
      { status: 400 },
    )
  }

  const plano = lead.planoTipo ?? 'essencial'
  const vencimento = lead.vencimentoDia ?? 10
  const formaPagamento = lead.formaPagamento ?? 'pix'
  const agora = new Date()

  let valor: number
  if (lead.valorNegociado) {
    valor = Number(lead.valorNegociado)
  } else {
    const planoDB = await prisma.plano.findUnique({
      where: { tipo: plano as PlanoTipo },
      select: { valorMinimo: true },
    })
    valor = planoDB ? Number(planoDB.valorMinimo) : (PLANO_PRECOS_FALLBACK[plano] ?? 199)
  }

  // Gera o PDF com dados reais do cliente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfElement = React.createElement(ContratoPDF, {
    nome,
    cpf: dados?.['CPF'] ?? '',
    email,
    telefone: dados?.['Telefone'] ?? lead.contatoEntrada,
    cnpj: dados?.['CNPJ'],
    razaoSocial: dados?.['Razão Social'],
    cidade: dados?.['Cidade'],
    plano,
    valor,
    vencimentoDia: vencimento,
    formaPagamento,
    assinadoEm: agora,
    assinatura: '',  // campo vazio — ZapSign sobrepõe a assinatura eletrônica
    escritorioNome: escritorio?.nome ?? 'ContabAI',
    escritorioCnpj: escritorio?.cnpj,
    escritorioCrc: escritorio?.crc,
    escritorioCidade: escritorio?.cidade,
    multaPercent: escritorio?.multaPercent ?? 2.0,
    jurosMesPercent: escritorio?.jurosMesPercent ?? 1.0,
    diasAtrasoMulta: escritorio?.diasAtrasoMulta ?? 15,
    diasInadimplenciaRescisao: escritorio?.diasInadimplenciaRescisao ?? 60,
    diasAvisoRescisao: escritorio?.diasAvisoRescisao ?? 30,
    diasDocumentosAntecedencia: escritorio?.diasDocumentosAntecedencia ?? 5,
  } as never) as never

  const pdfBuffer = await renderToBuffer(pdfElement as never)

  // Upload PDF dinâmico → ZapSign → URL de assinatura
  const nomeContrato = `Contrato ${nome} — ${escritorio?.nome ?? 'ContabAI'}`
  const { docToken, signUrl } = await enviarContratoParaAssinatura(
    pdfBuffer,
    nomeContrato,
    { nome, email },
  )

  // Persiste contrato com status aguardando_assinatura
  const contrato = await prisma.contrato.upsert({
    where: { leadId: id },
    create: {
      leadId: id,
      planoTipo: plano as PlanoTipo,
      valorMensal: valor,
      vencimentoDia: vencimento,
      formaPagamento: formaPagamento as FormaPagamento,
      status: 'aguardando_assinatura',
      dadosSnapshot: dados,
      geradoEm: agora,
      enviadoEm: agora,
      zapsignDocToken: docToken,
      zapsignSignUrl: signUrl,
    },
    update: {
      status: 'aguardando_assinatura',
      enviadoEm: agora,
      zapsignDocToken: docToken,
      zapsignSignUrl: signUrl,
    },
  })

  // Avança o step do lead
  await prisma.lead.update({
    where: { id },
    data: { status: 'aguardando_assinatura', stepAtual: Math.max(lead.stepAtual, 5) },
  })

  return NextResponse.json({ ok: true, contratoId: contrato.id, signUrl })
}
