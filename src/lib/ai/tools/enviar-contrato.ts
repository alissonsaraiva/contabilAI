import React from 'react'
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { renderToBuffer } from '@react-pdf/renderer'
import { ContratoPDF, ContratoPDFTemplate } from '@/lib/pdf/contrato-template'
import { substituirVariaveis, buildContratoVariaveis } from '@/lib/pdf/contrato-variaveis'
import { enviarZapSign } from '@/lib/zapsign'
import { enviarClickSign } from '@/lib/clicksign'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import type { PlanoTipo, FormaPagamento } from '@prisma/client'

const PLANO_PRECOS_FALLBACK: Record<string, number> = {
  essencial:    199,
  profissional: 499,
  empresarial:  1200,
  startup:      1500,
}

// RFC 5322 simplificado — mais robusto que includes('@')
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const enviarContratoTool: Tool = {
  definition: {
    name: 'enviarContrato',
    description:
      'Gera o PDF do contrato de prestação de serviços e envia para o cliente assinar digitalmente via ZapSign ou ClickSign. Use quando o operador disser "envia o contrato", "manda pra assinatura", "gera o contrato do lead X", etc. O lead precisa ter e-mail cadastrado nos dados de onboarding.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID do lead para o qual gerar e enviar o contrato.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Enviar contrato',
    descricao: 'Gera PDF do contrato e envia ao cliente via ZapSign ou ClickSign para assinatura eletrônica.',
    categoria: 'Funil',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const leadId = (input.leadId as string | undefined) ?? ctx.leadId

    if (!leadId) {
      return {
        sucesso: false,
        erro:   'leadId não fornecido.',
        resumo: 'Lead não identificado para enviar contrato.',
      }
    }

    try {
      const [lead, escritorio, contratoExistente] = await Promise.all([
        prisma.lead.findUnique({ where: { id: leadId } }),
        prisma.escritorio.findFirst(),
        prisma.contrato.findUnique({
          where:  { leadId },
          select: { status: true, zapsignSignUrl: true, clicksignSignUrl: true, enviadoEm: true },
        }),
      ])

      if (!lead) {
        return { sucesso: false, erro: 'Lead não encontrado.', resumo: 'Lead não encontrado.' }
      }

      // Evita reenviar contrato que já está aguardando assinatura
      if (contratoExistente?.status === 'aguardando_assinatura') {
        const signUrl = contratoExistente.zapsignSignUrl ?? contratoExistente.clicksignSignUrl
        const enviadoEm = contratoExistente.enviadoEm
          ? contratoExistente.enviadoEm.toLocaleDateString('pt-BR')
          : 'data desconhecida'
        return {
          sucesso: true,
          dados:   { leadId, signUrl, jaEnviado: true },
          resumo:  `Contrato já enviado em ${enviadoEm} e aguardando assinatura. Link atual: ${signUrl ?? '(sem link disponível)'}. Para reenviar, cancele o contrato atual primeiro.`,
        }
      }

      const provedor    = escritorio?.provedorAssinatura ?? 'zapsign'
      const zapsignToken  = escritorio?.zapsignToken  ?? ''
      const clicksignKey  = escritorio?.clicksignKey  ?? ''

      if (provedor === 'zapsign' && !zapsignToken) {
        return {
          sucesso: false,
          erro:   'ZapSign não configurado.',
          resumo: 'ZapSign não configurado. Acesse Configurações → Integrações.',
        }
      }
      if (provedor === 'clicksign' && !clicksignKey) {
        return {
          sucesso: false,
          erro:   'ClickSign não configurado.',
          resumo: 'ClickSign não configurado. Acesse Configurações → Integrações.',
        }
      }

      const dados = lead.dadosJson as Record<string, string> | null
      const nome  = dados?.['Nome completo'] ?? lead.contatoEntrada
      const email = dados?.['E-mail']

      if (!email || !EMAIL_REGEX.test(email)) {
        return {
          sucesso: false,
          erro:   'E-mail do lead inválido ou não encontrado.',
          resumo: 'E-mail do lead inválido ou não encontrado. Preencha o campo E-mail no onboarding.',
        }
      }

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

      const pdfProps = {
        nome,
        cpf:          dados?.['CPF'] ?? '',
        rg:           dados?.['RG'],
        email,
        telefone:     dados?.['Telefone'] ?? lead.contatoEntrada,
        cnpj:         dados?.['CNPJ'],
        razaoSocial:  dados?.['Razão Social'],
        nomeFantasia: dados?.['Nome Fantasia'],
        logradouro:   dados?.['Logradouro'] ?? dados?.['Endereço'],
        numero:       dados?.['Número'],
        complemento:  dados?.['Complemento'],
        bairro:       dados?.['Bairro'],
        cidade:       dados?.['Cidade'],
        uf:           dados?.['UF'] ?? dados?.['Estado'],
        cep:          dados?.['CEP'],
        plano,
        valor,
        vencimentoDia: vencimento,
        formaPagamento,
        assinadoEm:   agora,
        assinatura:   '',
        escritorioNome:             escritorio?.nome              ?? 'Avos',
        escritorioCnpj:             escritorio?.cnpj,
        escritorioCrc:              escritorio?.crc,
        escritorioCidade:           escritorio?.cidade,
        escritorioLogradouro:       escritorio?.logradouro,
        escritorioNumero:           escritorio?.numero,
        escritorioBairro:           escritorio?.bairro,
        escritorioUf:               escritorio?.uf,
        escritorioCep:              escritorio?.cep,
        multaPercent:               escritorio?.multaPercent              ?? 2.0,
        jurosMesPercent:            escritorio?.jurosMesPercent           ?? 1.0,
        diasAtrasoMulta:            escritorio?.diasAtrasoMulta           ?? 15,
        diasInadimplenciaRescisao:  escritorio?.diasInadimplenciaRescisao ?? 60,
        diasAvisoRescisao:          escritorio?.diasAvisoRescisao         ?? 30,
        diasDocumentosAntecedencia: escritorio?.diasDocumentosAntecedencia ?? 5,
      }

      // Respeita o template customizado do escritório (igual à rota HTTP)
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
          escritorioNome:       escritorio.nome ?? 'Avos',
          escritorioCnpj:       escritorio.cnpj,
          escritorioCrc:        escritorio.crc,
          escritorioCidade:     escritorio.cidade,
          escritorioLogradouro: escritorio.logradouro,
          escritorioNumero:     escritorio.numero,
          escritorioBairro:     escritorio.bairro,
          escritorioUf:         escritorio.uf,
          escritorioCep:        escritorio.cep,
        })
        const textoTemplate = substituirVariaveis(escritorio.contratoTemplate, vars)
        pdfElement = React.createElement(ContratoPDFTemplate, { ...pdfProps, textoTemplate })
      } else {
        pdfElement = React.createElement(ContratoPDF, pdfProps)
      }

      const pdfBuffer    = await renderToBuffer(pdfElement as never)
      const nomeContrato = `Contrato ${nome} — ${escritorio?.nome ?? 'Avos'}`

      let zapsignDocToken: string | undefined
      let clicksignDocKey: string | undefined
      let signUrl: string

      if (provedor === 'clicksign') {
        const result  = await enviarClickSign(clicksignKey, pdfBuffer, nomeContrato, { nome, email })
        clicksignDocKey = result.docKey
        signUrl         = result.signUrl
      } else {
        const result  = await enviarZapSign(zapsignToken, pdfBuffer, nomeContrato, { nome, email })
        zapsignDocToken = result.docToken
        signUrl         = result.signUrl
      }

      await prisma.contrato.upsert({
        where:  { leadId },
        create: {
          leadId,
          planoTipo:     plano as PlanoTipo,
          valorMensal:   valor,
          vencimentoDia: vencimento,
          formaPagamento: formaPagamento as FormaPagamento,
          status:        'aguardando_assinatura',
          dadosSnapshot: dados,
          geradoEm:      agora,
          enviadoEm:     agora,
          ...(zapsignDocToken  && { zapsignDocToken,  zapsignSignUrl:   signUrl }),
          ...(clicksignDocKey  && { clicksignKey: clicksignDocKey, clicksignSignUrl: signUrl }),
        },
        update: {
          status:    'aguardando_assinatura',
          enviadoEm: agora,
          ...(zapsignDocToken  && { zapsignDocToken,  zapsignSignUrl:   signUrl }),
          ...(clicksignDocKey  && { clicksignKey: clicksignDocKey, clicksignSignUrl: signUrl }),
        },
      })

      await prisma.lead.update({
        where: { id: leadId },
        data:  { status: 'aguardando_assinatura', stepAtual: Math.max(lead.stepAtual, 5) },
      })

      return {
        sucesso: true,
        dados:   { leadId, signUrl, provedor },
        resumo:  `Contrato de "${nome}" gerado e enviado via ${provedor === 'clicksign' ? 'ClickSign' : 'ZapSign'} para ${email}. Link de assinatura: ${signUrl}`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[tool:enviarContrato] Erro:', err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-enviar-contrato', operation: 'enviar-para-assinatura' },
        extra: { leadId },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao enviar contrato: ${msg}`,
      }
    }
  },
}

registrarTool(enviarContratoTool)
