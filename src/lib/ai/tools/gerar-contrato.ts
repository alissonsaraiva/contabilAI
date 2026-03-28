import React from 'react'
import { prisma } from '@/lib/prisma'
import { renderToBuffer } from '@react-pdf/renderer'
import { ContratoPDF } from '@/lib/pdf/contrato-template'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import type { PlanoTipo, FormaPagamento } from '@prisma/client'

const PLANO_PRECOS_FALLBACK: Record<string, number> = {
  essencial:    199,
  profissional: 499,
  empresarial:  1200,
  startup:      1500,
}

const gerarContratoTool: Tool = {
  definition: {
    name: 'gerarContrato',
    description:
      'Gera o PDF do contrato de prestação de serviços e o armazena para download, SEM enviar para assinatura. Use quando o operador disser "gera o contrato para revisar", "prepara o contrato do lead X", "quero ver o contrato antes de enviar". Para enviar diretamente para assinatura use enviarContrato.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID do lead para o qual gerar o contrato.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Gerar contrato (pré-visualização)',
    descricao: 'Gera o PDF do contrato e o disponibiliza para download sem enviar para assinatura eletrônica.',
    categoria: 'Funil',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const leadId = (input.leadId as string | undefined) ?? ctx.leadId

    if (!leadId) {
      return {
        sucesso: false,
        erro:   'leadId não fornecido.',
        resumo: 'Lead não identificado para gerar contrato.',
      }
    }

    const [lead, escritorio] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId } }),
      prisma.escritorio.findFirst(),
    ])

    if (!lead) {
      return { sucesso: false, erro: 'Lead não encontrado.', resumo: 'Lead não encontrado.' }
    }

    const dados = lead.dadosJson as Record<string, string> | null
    const nome  = dados?.['Nome completo'] ?? lead.contatoEntrada

    const plano          = lead.planoTipo      ?? 'essencial'
    const vencimento     = lead.vencimentoDia  ?? 10
    const formaPagamento = lead.formaPagamento ?? 'pix'
    const agora          = new Date()

    let valor: number
    if (lead.valorNegociado) {
      valor = Number(lead.valorNegociado)
    } else {
      const planoDB = await prisma.plano.findFirst({
        where:  { tipo: plano as PlanoTipo, ativo: true },
        select: { valorMinimo: true },
      })
      valor = planoDB ? Number(planoDB.valorMinimo) : (PLANO_PRECOS_FALLBACK[plano] ?? 199)
    }

    const pdfElement = React.createElement(ContratoPDF, {
      nome,
      cpf:          dados?.['CPF'] ?? '',
      email:        dados?.['E-mail'] ?? '',
      telefone:     dados?.['Telefone'] ?? lead.contatoEntrada,
      cnpj:         dados?.['CNPJ'],
      razaoSocial:  dados?.['Razão Social'],
      cidade:       dados?.['Cidade'],
      plano,
      valor,
      vencimentoDia: vencimento,
      formaPagamento,
      assinadoEm:   agora,
      assinatura:   '',
      escritorioNome:             escritorio?.nome              ?? 'ContabAI',
      escritorioCnpj:             escritorio?.cnpj,
      escritorioCrc:              escritorio?.crc,
      escritorioCidade:           escritorio?.cidade,
      multaPercent:               escritorio?.multaPercent              ?? 2.0,
      jurosMesPercent:            escritorio?.jurosMesPercent           ?? 1.0,
      diasAtrasoMulta:            escritorio?.diasAtrasoMulta           ?? 15,
      diasInadimplenciaRescisao:  escritorio?.diasInadimplenciaRescisao ?? 60,
      diasAvisoRescisao:          escritorio?.diasAvisoRescisao         ?? 30,
      diasDocumentosAntecedencia: escritorio?.diasDocumentosAntecedencia ?? 5,
    } as never) as never

    const pdfBuffer = await renderToBuffer(pdfElement as never)

    // Tenta fazer upload para storage se configurado
    let pdfUrl: string | null = null
    const storageConfigured = !!(
      process.env.STORAGE_ENDPOINT &&
      process.env.STORAGE_ACCESS_KEY_ID &&
      process.env.STORAGE_SECRET_ACCESS_KEY &&
      process.env.STORAGE_BUCKET_NAME
    )

    if (storageConfigured) {
      try {
        const { uploadArquivo, storageKeys } = await import('@/lib/storage')
        const key = storageKeys.contratoLead(leadId)
        pdfUrl = await uploadArquivo(key, pdfBuffer, 'application/pdf')
      } catch (err) {
        console.error('[gerarContrato] Falha no upload do PDF:', err)
      }
    }

    // Salva/atualiza registro do contrato como rascunho
    await prisma.contrato.upsert({
      where:  { leadId },
      create: {
        leadId,
        planoTipo:      plano as PlanoTipo,
        valorMensal:    valor,
        vencimentoDia:  vencimento,
        formaPagamento: formaPagamento as FormaPagamento,
        status:         'aguardando_assinatura',
        dadosSnapshot:  dados ?? undefined,
        geradoEm:       agora,
        ...(pdfUrl && { pdfUrl }),
      },
      update: {
        geradoEm: agora,
        ...(pdfUrl && { pdfUrl }),
      },
    })

    const downloadInfo = pdfUrl
      ? `PDF disponível para download: ${pdfUrl}`
      : 'PDF gerado em memória — storage não configurado, acesse o CRM para download.'

    return {
      sucesso: true,
      dados:   { leadId, pdfUrl, plano, valor, vencimento },
      resumo:  `Contrato de "${nome}" gerado. Plano: ${plano}, valor: R$${valor}/mês, vencimento dia ${vencimento}. ${downloadInfo}`,
    }
  },
}

registrarTool(gerarContratoTool)
