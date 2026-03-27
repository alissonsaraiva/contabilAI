import { prisma } from '@/lib/prisma'
import { sendText } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const responderEscalacaoTool: Tool = {
  definition: {
    name: 'responderEscalacao',
    description:
      'Responde uma escalação pendente enviando uma mensagem ao cliente e marcando a escalação como resolvida. Use quando o operador disser "responde a escalação X", "resolve a escalação pendente", "envia essa resposta para a escalação", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        escalacaoId: {
          type: 'string',
          description: 'ID da escalação a responder. Se omitido, busca a primeira escalação pendente do cliente/lead em contexto.',
        },
        resposta: {
          type: 'string',
          description: 'Mensagem a ser enviada ao cliente como resposta à escalação.',
        },
      },
      required: ['resposta'],
    },
  },

  meta: {
    label: 'Responder escalação',
    descricao: 'Responde uma escalação pendente via WhatsApp ou portal e a marca como resolvida.',
    categoria: 'Clientes',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const resposta     = input.resposta     as string
    const escalacaoId  = input.escalacaoId  as string | undefined

    // Localiza a escalação
    let esc
    if (escalacaoId) {
      esc = await prisma.escalacao.findUnique({ where: { id: escalacaoId } })
    } else {
      // Busca a mais recente pendente do cliente/lead em contexto
      esc = await prisma.escalacao.findFirst({
        where: {
          status: 'pendente',
          ...(ctx.clienteId && { clienteId: ctx.clienteId }),
          ...(ctx.leadId    && { leadId:    ctx.leadId }),
        },
        orderBy: { criadoEm: 'desc' },
      })
    }

    if (!esc) {
      return {
        sucesso: false,
        erro:   'Escalação não encontrada ou não há escalações pendentes.',
        resumo: 'Nenhuma escalação pendente encontrada para responder.',
      }
    }

    if (esc.status === 'resolvida') {
      return {
        sucesso: false,
        erro:   'Esta escalação já foi resolvida.',
        resumo: 'Escalação já estava resolvida.',
      }
    }

    // Envia pelo canal correto
    if (esc.canal === 'whatsapp' && esc.remoteJid) {
      const row = await prisma.escritorio.findFirst({
        select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
      })

      if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
        const rawKey = row.evolutionApiKey
        const apiKey = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey

        const sendResult = await sendText(
          { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance },
          esc.remoteJid,
          resposta,
        )

        if (!sendResult.ok) {
          return {
            sucesso: false,
            erro:   `Falha ao enviar WhatsApp: ${(sendResult as any).error}`,
            resumo: `Não foi possível enviar a resposta via WhatsApp.`,
          }
        }

        // Persiste a resposta no histórico da conversa
        const conversaRow = await prisma.conversaIA.findFirst({
          where:   { canal: 'whatsapp', remoteJid: esc.remoteJid },
          orderBy: { atualizadaEm: 'desc' },
          select:  { id: true },
        })
        if (conversaRow) {
          prisma.mensagemIA.create({
            data: {
              conversaId: conversaRow.id,
              role:       'assistant',
              conteudo:   resposta,
              status:     'sent',
              tentativas: 1,
            },
          }).catch(() => {})

          // Reativa a IA
          prisma.conversaIA.update({
            where: { id: conversaRow.id },
            data:  { pausadaEm: null, pausadoPorId: null },
          }).catch(() => {})
        }
      }
    }

    // Resolve a escalação
    await prisma.escalacao.update({
      where: { id: esc.id },
      data: {
        status:           'resolvida',
        orientacaoHumana: resposta,
        respostaEnviada:  resposta,
      },
    })

    // Indexa no RAG
    import('@/lib/rag/ingest').then(({ indexarEscalacao }) =>
      indexarEscalacao({
        id:               esc!.id,
        clienteId:        esc!.clienteId,
        leadId:           esc!.leadId,
        canal:            esc!.canal,
        motivoIA:         esc!.motivoIA,
        orientacaoHumana: resposta,
        respostaEnviada:  resposta,
        criadoEm:         esc!.criadoEm,
      })
    ).catch(() => {})

    return {
      sucesso: true,
      dados:   { escalacaoId: esc.id, canal: esc.canal },
      resumo:  `Escalação respondida e resolvida. Canal: ${esc.canal}. Mensagem enviada: "${resposta.slice(0, 80)}${resposta.length > 80 ? '...' : ''}"`,
    }
  },
}

registrarTool(responderEscalacaoTool)
