import { prisma } from '@/lib/prisma'
import { sendText } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

function buildRemoteJid(phone: string): string {
  const digits      = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

const enviarWhatsAppClienteTool: Tool = {
  definition: {
    name: 'enviarWhatsAppCliente',
    description:
      'Envia uma mensagem WhatsApp proativa para um cliente. Use quando o operador disser "manda um whatsapp pro cliente", "envia mensagem para o cliente X no zap", "avisa o cliente pelo whatsapp que...", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente para quem enviar a mensagem.',
        },
        mensagem: {
          type: 'string',
          description: 'Texto da mensagem a enviar via WhatsApp.',
        },
      },
      required: ['mensagem'],
    },
  },

  meta: {
    label: 'WhatsApp → Cliente',
    descricao: 'Envia mensagem WhatsApp proativa para um cliente ativo via Evolution API.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const mensagem  = input.mensagem  as string
    const clienteId = (input.clienteId as string | undefined) ?? ctx.clienteId

    if (!clienteId) {
      return {
        sucesso: false,
        erro:   'clienteId não fornecido.',
        resumo: 'Cliente não identificado para envio de WhatsApp.',
      }
    }

    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { id: true, nome: true, whatsapp: true, telefone: true },
    })

    if (!cliente) {
      return { sucesso: false, erro: 'Cliente não encontrado.', resumo: 'Cliente não encontrado.' }
    }

    const phone = cliente.whatsapp || cliente.telefone
    if (!phone) {
      return {
        sucesso: false,
        erro:   'Cliente sem número de WhatsApp cadastrado.',
        resumo: `Cliente "${cliente.nome}" não tem número de WhatsApp cadastrado.`,
      }
    }

    const row = await prisma.escritorio.findFirst({
      select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
    })

    if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) {
      return {
        sucesso: false,
        erro:   'WhatsApp não configurado.',
        resumo: 'WhatsApp não configurado no escritório. Acesse Configurações → Integrações.',
      }
    }

    const rawKey   = row.evolutionApiKey
    const apiKey   = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey
    const remoteJid = buildRemoteJid(phone)

    // Busca ou cria conversa
    let conversa = await prisma.conversaIA.findFirst({
      where:   { canal: 'whatsapp', remoteJid },
      orderBy: { atualizadaEm: 'desc' },
      select:  { id: true },
    })

    if (!conversa) {
      conversa = await prisma.conversaIA.create({
        data:   { canal: 'whatsapp', remoteJid, clienteId },
        select: { id: true },
      })
    }

    const sendResult = await sendText(
      { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance },
      remoteJid,
      mensagem,
    )

    // Registra interação e mensagem
    await Promise.all([
      prisma.interacao.create({
        data: {
          clienteId,
          tipo:    'whatsapp_enviado',
          titulo:  'WhatsApp enviado pelo Agente',
          conteudo: mensagem,
          metadados: { registradoPorAI: true, solicitante: ctx.solicitanteAI },
        } as never,
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
        erro:   `Mensagem salva mas falha ao entregar: ${(sendResult as any).error}`,
        resumo: `Falha ao entregar WhatsApp para "${cliente.nome}".`,
      }
    }

    return {
      sucesso: true,
      dados:   { clienteId, conversaId: conversa.id },
      resumo:  `WhatsApp enviado para "${cliente.nome}" (${phone}): "${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}"`,
    }
  },
}

registrarTool(enviarWhatsAppClienteTool)
