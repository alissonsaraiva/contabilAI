import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ContratoPDF, ContratoPDFTemplate } from '@/lib/pdf/contrato-template'
import { substituirVariaveis, buildContratoVariaveis } from '@/lib/pdf/contrato-variaveis'
import { enviarZapSign } from '@/lib/zapsign'
import { enviarClickSign } from '@/lib/clicksign'
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
  const { id } = await params

  const [lead, escritorio] = await Promise.all([
    prisma.lead.findUnique({ where: { id } }),
    prisma.escritorio.findFirst(),
  ])

  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  // Verifica qual provedor está configurado
  const provedor = escritorio?.provedorAssinatura ?? 'zapsign'
  const zapsignToken  = escritorio?.zapsignToken  ?? ''
  const clicksignKey  = escritorio?.clicksignKey  ?? ''

  if (provedor === 'zapsign' && !zapsignToken) {
    return NextResponse.json({ error: 'ZapSign não configurado. Acesse Configurações → Integrações.' }, { status: 503 })
  }
  if (provedor === 'clicksign' && !clicksignKey) {
    return NextResponse.json({ error: 'ClickSign não configurado. Acesse Configurações → Integrações.' }, { status: 503 })
  }

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
    const planoDB = await prisma.plano.findFirst({
      where: { tipo: plano as PlanoTipo, ativo: true },
      select: { valorMinimo: true },
    })
    valor = planoDB ? Number(planoDB.valorMinimo) : (PLANO_PRECOS_FALLBACK[plano] ?? 199)
  }

  // Gera PDF com dados reais do cliente
  const pdfProps = {
    nome,
    cpf: dados?.['CPF'] ?? '',
    rg: dados?.['RG'],
    email,
    telefone: dados?.['Telefone'] ?? lead.contatoEntrada,
    cnpj: dados?.['CNPJ'],
    razaoSocial: dados?.['Razão Social'],
    nomeFantasia: dados?.['Nome Fantasia'],
    logradouro: dados?.['Logradouro'] ?? dados?.['Endereço'],
    numero: dados?.['Número'],
    complemento: dados?.['Complemento'],
    bairro: dados?.['Bairro'],
    cidade: dados?.['Cidade'],
    uf: dados?.['UF'] ?? dados?.['Estado'],
    cep: dados?.['CEP'],
    plano,
    valor,
    vencimentoDia: vencimento,
    formaPagamento,
    assinadoEm: agora,
    assinatura: '',
    escritorioNome: escritorio?.nome ?? 'Avos',
    escritorioCnpj: escritorio?.cnpj,
    escritorioCrc: escritorio?.crc,
    escritorioCidade: escritorio?.cidade,
    escritorioLogradouro: escritorio?.logradouro,
    escritorioNumero: escritorio?.numero,
    escritorioBairro: escritorio?.bairro,
    escritorioUf: escritorio?.uf,
    escritorioCep: escritorio?.cep,
    multaPercent: escritorio?.multaPercent ?? 2.0,
    jurosMesPercent: escritorio?.jurosMesPercent ?? 1.0,
    diasAtrasoMulta: escritorio?.diasAtrasoMulta ?? 15,
    diasInadimplenciaRescisao: escritorio?.diasInadimplenciaRescisao ?? 60,
    diasAvisoRescisao: escritorio?.diasAvisoRescisao ?? 30,
    diasDocumentosAntecedencia: escritorio?.diasDocumentosAntecedencia ?? 5,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pdfElement: any
  if (escritorio?.contratoTemplate?.trim()) {
    const vars = buildContratoVariaveis({
      dados,
      plano,
      valor,
      vencimentoDia: vencimento,
      formaPagamento,
      assinadoEm: agora,
      escritorioNome: escritorio.nome ?? 'Avos',
      escritorioCnpj: escritorio.cnpj,
      escritorioCrc: escritorio.crc,
      escritorioCidade: escritorio.cidade,
      escritorioLogradouro: escritorio.logradouro,
      escritorioNumero: escritorio.numero,
      escritorioBairro: escritorio.bairro,
      escritorioUf: escritorio.uf,
      escritorioCep: escritorio.cep,
    })
    const textoTemplate = substituirVariaveis(escritorio.contratoTemplate, vars)
    pdfElement = React.createElement(ContratoPDFTemplate, { ...pdfProps, textoTemplate })
  } else {
    pdfElement = React.createElement(ContratoPDF, pdfProps)
  }

  const pdfBuffer = await renderToBuffer(pdfElement)
  const nomeContrato = `Contrato ${nome} — ${escritorio?.nome ?? 'Avos'}`

  // Envia para o provedor configurado
  let zapsignDocToken: string | undefined
  let clicksignDocKey: string | undefined
  let signUrl: string

  if (provedor === 'clicksign') {
    const result = await enviarClickSign(clicksignKey, pdfBuffer, nomeContrato, { nome, email })
    clicksignDocKey = result.docKey
    signUrl = result.signUrl
  } else {
    const result = await enviarZapSign(zapsignToken, pdfBuffer, nomeContrato, { nome, email })
    zapsignDocToken = result.docToken
    signUrl = result.signUrl
  }

  // Persiste contrato
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
      ...(zapsignDocToken  && { zapsignDocToken, zapsignSignUrl: signUrl }),
      ...(clicksignDocKey  && { clicksignKey: clicksignDocKey, clicksignSignUrl: signUrl }),
    },
    update: {
      status: 'aguardando_assinatura',
      enviadoEm: agora,
      ...(zapsignDocToken  && { zapsignDocToken, zapsignSignUrl: signUrl }),
      ...(clicksignDocKey  && { clicksignKey: clicksignDocKey, clicksignSignUrl: signUrl }),
    },
  })

  await prisma.lead.update({
    where: { id },
    data: { status: 'aguardando_assinatura', stepAtual: Math.max(lead.stepAtual, 5) },
  })

  return NextResponse.json({ ok: true, contratoId: contrato.id, signUrl, provedor })
}
