import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sendText } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { registrarInteracao } from '@/lib/services/interacoes'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

function buildRemoteJid(phone: string): string {
  const digits      = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

const enviarWhatsAppSocioTool: Tool = {
  definition: {
    name: 'enviarWhatsAppSocio',
    description:
      'Envia uma mensagem WhatsApp para um sócio específico de uma empresa. Use quando o operador disser "manda um zap para o sócio X", "envia mensagem para o João (sócio da empresa Y)", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        socioId: {
          type: 'string',
          description: 'ID do sócio para quem enviar a mensagem.',
        },
        mensagem: {
          type: 'string',
          description: 'Texto da mensagem a enviar via WhatsApp.',
        },
      },
      required: ['socioId', 'mensagem'],
    },
  },

  meta: {
    label: 'WhatsApp → Sócio',
    descricao: 'Envia mensagem WhatsApp proativa para um sócio de empresa via Evolution API.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const parsed = z.object({
      socioId:  z.string().min(1).max(200),
      mensagem: z.string().min(1).max(5000),
    }).safeParse(input)
    if (!parsed.success) return { sucesso: false, erro: `Parâmetros inválidos: ${parsed.error.issues[0].message}`, resumo: 'Parâmetros inválidos.' }
    const { socioId, mensagem } = parsed.data

    const socio = await prisma.socio.findUnique({
      where:  { id: socioId },
      select: {
        id: true, nome: true, whatsapp: true, telefone: true,
        empresa: { select: { cliente: { select: { id: true } } } },
      },
    })

    if (!socio) {
      return { sucesso: false, erro: 'Sócio não encontrado.', resumo: 'Sócio não encontrado.' }
    }

    const phone = socio.whatsapp || socio.telefone
    if (!phone) {
      return {
        sucesso: false,
        erro:   'Sócio sem número de WhatsApp/telefone cadastrado.',
        resumo: `Sócio "${socio.nome}" não tem número cadastrado.`,
      }
    }

    const row = await prisma.escritorio.findFirst({
      select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
    })
    if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) {
      return {
        sucesso: false,
        erro:   'WhatsApp não configurado.',
        resumo: 'WhatsApp não configurado no escritório.',
      }
    }

    const rawKey    = row.evolutionApiKey
    const apiKey    = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey
    const remoteJid = buildRemoteJid(phone)
    const clienteId = socio.empresa.cliente?.id

    // Busca ou cria conversa para o remoteJid
    let conversa = await prisma.conversaIA.findFirst({
      where:   { canal: 'whatsapp', remoteJid },
      orderBy: { atualizadaEm: 'desc' },
      select:  { id: true },
    })
    if (!conversa) {
      conversa = await prisma.conversaIA.create({
        data:   { canal: 'whatsapp', remoteJid, socioId, clienteId },
        select: { id: true },
      })
    }

    // Dedup via DB: evita duplicatas entre restarts de servidor
    const duplicataDb = await prisma.mensagemIA.findFirst({
      where: {
        conversaId: conversa.id,
        role:       'assistant',
        conteudo:   { startsWith: mensagem.slice(0, 80) },
        criadaEm:   { gte: new Date(Date.now() - 90_000) },
      },
      select: { id: true },
    })
    if (duplicataDb) {
      return {
        sucesso: false,
        erro:    'Duplicata detectada no banco de dados.',
        resumo:  `Mensagem idêntica para sócio "${socio.nome}" já foi enviada nos últimos 90 segundos — ignorada para evitar duplicata.`,
      }
    }

    const sendResult = await sendText(
      { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance },
      remoteJid,
      mensagem,
    )

    await Promise.all([
      clienteId && registrarInteracao({
        clienteId,
        tipo:     'whatsapp_enviado',
        titulo:   `WhatsApp enviado para sócio ${socio.nome}`,
        conteudo: mensagem,
        origem:   'usuario',
        metadados: { registradoPorAI: true, solicitante: ctx.solicitanteAI, socioId },
      }),
      prisma.mensagemIA.create({
        data: {
          conversaId: conversa.id,
          role:       'assistant',
          conteudo:   mensagem,
          status:     sendResult.ok ? 'sent' : 'failed',
          tentativas: 1,
          erroEnvio:  sendResult.ok ? null : (sendResult as any).error,
        },
      }),
    ])

    if (!sendResult.ok) {
      return {
        sucesso: false,
        erro:   `Falha ao entregar mensagem: ${(sendResult as any).error}`,
        resumo: `Falha ao enviar WhatsApp para sócio "${socio.nome}".`,
      }
    }

    return {
      sucesso: true,
      dados:   { socioId, conversaId: conversa.id },
      resumo:  `WhatsApp enviado para sócio "${socio.nome}" (${phone}): "${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}"`,
    }
  },
}

registrarTool(enviarWhatsAppSocioTool)
