import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { searchClienteIds } from '@/lib/search'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { sendText } from '@/lib/evolution'

type Nivel = 'gentil' | 'urgente' | 'reforco'

function montarMensagem(
  nome: string,
  valor: string,
  dataVenc: string,
  nivel: Nivel,
  pagamento: string,
  nomeEscritorio: string,
): string {
  const pagStr = pagamento || 'Entre em contato conosco para obter uma nova via de pagamento.'

  if (nivel === 'gentil') {
    return `Olá, ${nome}! 😊\n\nPassamos para lembrar que há uma cobrança em aberto de *${valor}* com vencimento em *${dataVenc}*.\n\nPara regularizar:\n${pagStr}\n\nQualquer dúvida, estamos à disposição! 🙏\n— ${nomeEscritorio}`
  }
  if (nivel === 'urgente') {
    return `Olá, ${nome}. ⚠️\n\nA cobrança de *${valor}* (vencida em *${dataVenc}*) ainda não foi regularizada.\n\nPedimos que efetue o pagamento o quanto antes para evitar a suspensão dos serviços contábeis.\n\n${pagStr}\n\nEm caso de dificuldades, entre em contato conosco.\n— ${nomeEscritorio}`
  }
  // reforco
  return `${nome}, atenção. 🚨\n\nSua cobrança de *${valor}* permanece em aberto (vencimento: *${dataVenc}*).\n\nPara evitar impactos nos seus serviços, regularize agora:\n${pagStr}\n\nSe precisar negociar, entre em contato com urgência.\n— ${nomeEscritorio}`
}

const enviarCobrancaInadimplenteTool: Tool = {
  definition: {
    name: 'enviarCobrancaInadimplente',
    description:
      'Envia mensagem WhatsApp de cobrança para um cliente inadimplente. Entrega a cobrança em aberto (PIX ou boleto) ao sócio principal ou contato do cliente. ' +
      'Use quando o operador pedir para "mandar cobrança", "enviar boleto", "notificar inadimplente" ou "cobrar cliente". ' +
      'Níveis: "gentil" (padrão, lembrança amigável), "urgente" (risco de suspensão), "reforco" (reforço urgente).',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente (use quando já disponível no contexto).',
        },
        busca: {
          type: 'string',
          description: 'Nome, CPF, CNPJ ou e-mail do cliente para busca textual.',
        },
        nivel: {
          type: 'string',
          enum: ['gentil', 'urgente', 'reforco'],
          description: 'Nível da mensagem: gentil (padrão), urgente (risco suspensão), reforco (reforço urgente).',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Enviar cobrança (WhatsApp)',
    descricao: 'Envia mensagem de cobrança via WhatsApp ao sócio principal ou contato do cliente.',
    categoria: 'Financeiro',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    try {
      const clienteIdInput = (input.clienteId as string | undefined) ?? ctx.clienteId
      const busca          = input.busca as string | undefined
      const nivel          = (input.nivel as Nivel | undefined) ?? 'gentil'

      if (!clienteIdInput && !busca) {
        return {
          sucesso: false,
          erro:    'Forneça clienteId ou busca (nome/CPF/CNPJ/e-mail).',
          resumo:  'Não foi possível identificar o cliente.',
        }
      }

      const buscaNorm = busca ? busca.replace(/[.\-\/\s]/g, '') : undefined

      const cliente = clienteIdInput
        ? await prisma.cliente.findUnique({
            where:  { id: clienteIdInput },
            select: {
              id: true, nome: true, status: true, whatsapp: true, telefone: true,
              empresa: {
                select: {
                  razaoSocial: true,
                  socios: {
                    where:  { principal: true },
                    select: { nome: true, whatsapp: true, telefone: true },
                    take:   1,
                  },
                },
              },
              cobrancasAsaas: {
                where:   { status: { in: ['PENDING', 'OVERDUE'] } },
                orderBy: { vencimento: 'asc' },
                take:    1,
                select:  { id: true, valor: true, vencimento: true, linkBoleto: true, pixCopiaECola: true },
              },
            },
          })
        : await (async () => {
            const ids = await searchClienteIds(busca!, buscaNorm)
            if (ids.length === 0) return null
            return prisma.cliente.findFirst({
              where: { id: { in: ids } },
              select: {
                id: true, nome: true, status: true, whatsapp: true, telefone: true,
                empresa: {
                  select: {
                    razaoSocial: true,
                    socios: {
                      where:  { principal: true },
                      select: { nome: true, whatsapp: true, telefone: true },
                      take:   1,
                    },
                  },
                },
                cobrancasAsaas: {
                  where:   { status: { in: ['PENDING', 'OVERDUE'] } },
                  orderBy: { vencimento: 'asc' },
                  take:    1,
                  select:  { id: true, valor: true, vencimento: true, linkBoleto: true, pixCopiaECola: true },
                },
              },
            })
          })()

      if (!cliente) {
        return { sucesso: false, erro: 'Cliente não encontrado.', resumo: 'Cliente não encontrado.' }
      }

      // GAP 6: valida se o cliente realmente está inadimplente antes de enviar mensagem
      // de cobrança. Evita enviar "risco de suspensão" para cliente em dia.
      if (cliente.status !== 'inadimplente') {
        const cobrancasAbertas = (cliente as any).cobrancasAsaas ?? []
        if (cobrancasAbertas.length === 0) {
          return {
            sucesso: false,
            erro:    `Cliente ${cliente.nome} não está inadimplente e não possui cobranças em aberto.`,
            resumo:  `${cliente.nome} está em dia — nenhuma cobrança em aberto encontrada.`,
          }
        }
        // Tem PENDING (não OVERDUE) — avisa o operador mas permite envio com nível gentil apenas
        if (nivel !== 'gentil') {
          return {
            sucesso: false,
            erro:    `Cliente ${cliente.nome} possui status "${cliente.status}" (não inadimplente). Use nível "gentil" para cobranças preventivas.`,
            resumo:  `Para enviar cobrança urgente/reforço, o cliente precisa estar inadimplente. Status atual: ${cliente.status}.`,
          }
        }
      }

      const cobranca = (cliente as any).cobrancasAsaas?.[0] ?? null
      if (!cobranca) {
        return {
          sucesso: false,
          erro:    'Nenhuma cobrança em aberto para este cliente.',
          resumo:  `${cliente.nome} não possui cobranças em aberto.`,
        }
      }

      // Resolve destino WhatsApp: sócio principal → cliente.whatsapp → cliente.telefone
      const socioP   = (cliente as any).empresa?.socios?.[0]
      const destWA   = socioP?.whatsapp ?? socioP?.telefone ?? cliente.whatsapp ?? cliente.telefone ?? null
      const nomeDest = socioP?.nome ?? cliente.nome

      if (!destWA) {
        return {
          sucesso: false,
          erro:    'Nenhum número WhatsApp disponível para este cliente.',
          resumo:  `${cliente.nome} não possui WhatsApp cadastrado.`,
        }
      }

      const pagStr = cobranca.pixCopiaECola
        ? `*PIX Copia e Cola:*\n${cobranca.pixCopiaECola}`
        : cobranca.linkBoleto
        ? `Acesse o boleto: ${cobranca.linkBoleto}`
        : ''

      const valor    = Number(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const dataVenc = new Date(cobranca.vencimento).toLocaleDateString('pt-BR')

      const esc = await prisma.escritorio.findFirst({
        select: { nomeFantasia: true, nome: true, evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
      })

      if (!esc?.evolutionApiUrl || !esc.evolutionApiKey || !esc.evolutionInstance) {
        return {
          sucesso: false,
          erro:    'Evolution API não configurado.',
          resumo:  'Não foi possível enviar: Evolution API não configurado.',
        }
      }

      const rawKey = esc.evolutionApiKey
      const evoCfg = {
        baseUrl:  esc.evolutionApiUrl,
        apiKey:   isEncrypted(rawKey) ? decrypt(rawKey) : rawKey,
        instance: esc.evolutionInstance,
      }
      const nomeEsc  = esc.nomeFantasia ?? esc.nome ?? 'Nosso escritório'
      const mensagem = montarMensagem(nomeDest, valor, dataVenc, nivel, pagStr, nomeEsc)
      const numero   = destWA.replace(/\D/g, '')

      // BUG 13: sendText agora dentro do try/catch — exceção era não capturada antes
      await sendText(evoCfg, `${numero}@s.whatsapp.net`, mensagem)

      await prisma.interacao.create({
        data: {
          clienteId: cliente.id,
          tipo:      'whatsapp_enviado',
          titulo:    `Cobrança ${cobranca.id} — ${nivel}`,
          conteudo:  mensagem,
          origem:    'ia_crm',
          usuarioId: ctx.usuarioId ?? null,
        },
      }).catch((err: unknown) =>
        console.error('[tool/enviar-cobranca-inadimplente] erro ao registrar interação:', { clienteId: cliente.id, err }),
      )

      return {
        sucesso: true,
        dados:   { clienteId: cliente.id, nivel, destWA: numero },
        resumo:  `Mensagem de cobrança (${nivel}) enviada para ${nomeDest} (${numero}).`,
      }
    } catch (err) {
      // BUG 13: captura exceções de sendText e quaisquer outros erros inesperados
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[tool/enviar-cobranca-inadimplente] erro inesperado:', err)
      Sentry.captureException(err, {
        tags:  { module: 'tool', operation: 'enviarCobrancaInadimplente' },
        extra: { clienteId: ctx.clienteId, canal: ctx.solicitanteAI },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  'Não foi possível enviar a mensagem de cobrança. Verifique se o WhatsApp está conectado.',
      }
    }
  },
}

registrarTool(enviarCobrancaInadimplenteTool)
