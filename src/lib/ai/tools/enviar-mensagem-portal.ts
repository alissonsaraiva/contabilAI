import { prisma } from '@/lib/prisma'
import { registrarInteracao } from '@/lib/services/interacoes'
import { emitConversaMensagem } from '@/lib/event-bus'
import { sendPushToCliente } from '@/lib/push'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const enviarMensagemPortalTool: Tool = {
  definition: {
    name: 'enviarMensagemPortal',
    description:
      'Envia uma mensagem para o cliente pelo chat do portal (Clara). Use quando o operador disser "manda uma mensagem pro cliente no portal", "envia pelo chat do portal", "responde o cliente no portal", etc. A mensagem aparece no chat em tempo real para o cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente para quem enviar a mensagem.',
        },
        mensagem: {
          type: 'string',
          description: 'Texto da mensagem a enviar pelo chat do portal.',
        },
      },
      required: ['mensagem'],
    },
  },

  meta: {
    label: 'Portal → Mensagem',
    descricao: 'Envia mensagem proativa para o cliente pelo chat do portal em tempo real.',
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
        resumo: 'Cliente não identificado para envio pelo portal.',
      }
    }

    const cliente = await prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: { id: true, nome: true },
    })

    if (!cliente) {
      return { sucesso: false, erro: 'Cliente não encontrado.', resumo: 'Cliente não encontrado.' }
    }

    // Busca a conversa de portal mais recente do cliente
    const conversa = await prisma.conversaIA.findFirst({
      where:   { canal: 'portal', clienteId },
      orderBy: { atualizadaEm: 'desc' },
      select:  { id: true, pausadaEm: true },
    })

    if (!conversa) {
      return {
        sucesso: false,
        erro:   'Nenhuma conversa de portal encontrada para este cliente.',
        resumo: `"${cliente.nome}" ainda não iniciou uma conversa pelo portal.`,
      }
    }

    // Salva mensagem e atualiza timestamp da conversa
    await Promise.all([
      prisma.mensagemIA.create({
        data: {
          conversaId: conversa.id,
          role:       'assistant',
          conteudo:   mensagem,
          status:     'sent',
        },
      }),
      prisma.conversaIA.update({
        where: { id: conversa.id },
        data:  { atualizadaEm: new Date() },
      }),
      registrarInteracao({
        clienteId,
        tipo:     'portal_enviado',
        titulo:   'Mensagem enviada pelo portal (Agente)',
        conteudo: mensagem,
        origem:   'usuario',
        metadados: { registradoPorAI: true, solicitante: ctx.solicitanteAI },
      }),
    ])

    // Notifica o portal em tempo real via SSE (se o cliente estiver com o chat aberto)
    emitConversaMensagem(conversa.id, { role: 'assistant', conteudo: mensagem })

    // Push notification — entrega mesmo com o portal fechado (fire-and-forget)
    sendPushToCliente(clienteId, {
      title: 'Nova mensagem do escritório',
      body:  mensagem.slice(0, 100),
      url:   '/portal/suporte',
    }).catch((err: unknown) =>
      console.error('[tool/enviar-mensagem-portal] erro ao enviar push:', { clienteId, err }),
    )

    return {
      sucesso: true,
      dados:   { clienteId, conversaId: conversa.id },
      resumo:  `Mensagem enviada para "${cliente.nome}" pelo portal: "${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}"`,
    }
  },
}

registrarTool(enviarMensagemPortalTool)
