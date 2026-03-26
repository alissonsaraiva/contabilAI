import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { uploadArquivo, storageKeys } from '@/lib/storage'
import { ContratoPDF } from '@/lib/pdf/contrato-template'
// RAG: indexarContrato é chamado via dynamic import em background
import React from 'react'
import type { PlanoTipo, FormaPagamento, StatusCliente } from '@prisma/client'

type Params = { params: Promise<{ id: string }> }

// Fallback de preços caso o plano não esteja cadastrado no banco
const PLANO_PRECOS_FALLBACK: Record<string, number> = {
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
  const agora = new Date()

  // Preço: valorNegociado > plano do banco > fallback hardcoded
  let valor: number
  if (lead.valorNegociado) {
    valor = Number(lead.valorNegociado)
  } else {
    const planoDB = await prisma.plano.findUnique({ where: { tipo: plano as PlanoTipo }, select: { valorMinimo: true } })
    valor = planoDB ? Number(planoDB.valorMinimo) : (PLANO_PRECOS_FALLBACK[plano] ?? 199)
  }

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
    multaPercent: escritorio?.multaPercent ?? 2.0,
    jurosMesPercent: escritorio?.jurosMesPercent ?? 1.0,
    diasAtrasoMulta: escritorio?.diasAtrasoMulta ?? 15,
    diasInadimplenciaRescisao: escritorio?.diasInadimplenciaRescisao ?? 60,
    diasAvisoRescisao: escritorio?.diasAvisoRescisao ?? 30,
    diasDocumentosAntecedencia: escritorio?.diasDocumentosAntecedencia ?? 5,
  // @react-pdf/renderer types require DocumentProps but ContratoPDF wraps Document internally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any
  const pdfBuffer = await renderToBuffer(pdfElement)

  let pdfUrl: string | null = null
  const storageConfigured = !!(
    process.env.STORAGE_ENDPOINT &&
    process.env.STORAGE_ACCESS_KEY_ID &&
    process.env.STORAGE_SECRET_ACCESS_KEY &&
    process.env.STORAGE_BUCKET_NAME
  )
  if (storageConfigured) {
    try {
      const key = storageKeys.contratoLead(id)
      pdfUrl = await uploadArquivo(key, pdfBuffer, 'application/pdf')
    } catch (err) {
      console.error('[contrato] Falha no upload do PDF:', err)
    }
  }

  const contrato = await prisma.contrato.upsert({
    where: { leadId: id },
    create: {
      leadId: id,
      planoTipo: plano as PlanoTipo,
      valorMensal: valor,
      vencimentoDia: vencimento,
      formaPagamento: formaPagamento as FormaPagamento,
      status: 'assinado',
      ...(pdfUrl && { pdfUrl }),
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
      ...(pdfUrl && { pdfUrl }),
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

  // Converte lead em cliente automaticamente (dentro de transação para evitar race condition)
  const nome = dados?.['Nome completo'] ?? lead.contatoEntrada
  const cpf = dados?.['CPF']
  const email = dados?.['E-mail'] ?? lead.contatoEntrada
  const telefone = dados?.['Telefone'] ?? lead.contatoEntrada

  if (nome && cpf && email) {
    try {
      // Verifica se já existe antes de entrar na transação (otimização de leitura)
      let cliente = await prisma.cliente.findUnique({ where: { leadId: id } })
      if (!cliente) {
        try {
          cliente = await prisma.$transaction(async (tx: any) => {
            const c = await tx.cliente.create({
              data: {
                leadId: id,
                nome,
                cpf,
                email,
                telefone,
                whatsapp: telefone,
                planoTipo: plano as PlanoTipo,
                valorMensal: valor,
                vencimentoDia: vencimento,
                formaPagamento: formaPagamento as FormaPagamento,
                status: 'ativo' as StatusCliente,
                dataInicio: agora,
                ...(dados?.['CNPJ'] && { cnpj: dados['CNPJ'] }),
                ...(dados?.['Razão Social'] && { razaoSocial: dados['Razão Social'] }),
                ...(dados?.['Nome Fantasia'] && { nomeFantasia: dados['Nome Fantasia'] }),
                ...(dados?.['Cidade'] && { cidade: dados['Cidade'] }),
                ...(lead.responsavelId && { responsavelId: lead.responsavelId }),
              },
            })
            await tx.contrato.update({ where: { id: contrato.id }, data: { clienteId: c.id } })
            return c
          })
        } catch (err: any) {
          if (err?.code === 'P2002') {
            // Criado por request concorrente — busca o que foi criado
            cliente = await prisma.cliente.findUnique({ where: { leadId: id } })
          } else {
            throw err
          }
        }
      } else {
        await prisma.contrato.update({ where: { id: contrato.id }, data: { clienteId: cliente.id } })
      }

      // Indexa dados do cliente recém-criado (CRM + Portal + WhatsApp)
      if (cliente) {
        import('@/lib/rag/ingest').then(({ indexarCliente }) => indexarCliente(cliente!)).catch(() => {})
      }
    } catch (err) {
      console.error('[contrato] Erro ao converter lead em cliente:', err)
    }
  }

  // Indexa o contrato no RAG em background com documentoId para permitir re-indexação idempotente
  import('@/lib/rag/ingest').then(async ({ indexarContrato }) => {
    await indexarContrato({
      id: contrato.id,
      leadId: id,
      dados,
      lead,
      plano,
      valor,
      vencimento,
      formaPagamento,
      agora,
      assinatura: assinatura.trim(),
    })
  }).catch(err => console.error('[rag] Erro ao indexar contrato:', err))

  return NextResponse.json({ ok: true, pdfUrl, contratoId: contrato.id })
}
