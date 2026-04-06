/**
 * Tool: enviarDASMEICliente
 *
 * Envia a DAS MEI (código de barras + link) ao cliente via WhatsApp e/ou email,
 * conforme os canais configurados. Usa a DAS mais recente com status "pendente"
 * ou a de uma competência específica.
 */
import * as Sentry from '@sentry/nextjs'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/send'
import { sendText } from '@/lib/evolution'
import { buildRemoteJid } from '@/lib/whatsapp-utils'
import { decrypt, isEncrypted } from '@/lib/crypto'
import type { EvolutionConfig } from '@/lib/evolution'

const enviarDASMEIClienteTool: Tool = {
  definition: {
    name: 'enviarDASMEICliente',
    description:
      'Envia a DAS MEI ao cliente (código de barras e/ou link de pagamento) via WhatsApp e/ou email. ' +
      'Use quando o cliente solicitar o boleto/DAS para pagamento, quando o operador quiser entregar a DAS manualmente, ' +
      'ou como parte de um fluxo de cobrança de DAS atrasada. ' +
      'Por padrão envia a DAS mais recente com status pendente. ' +
      'Se a DAS não estiver disponível, sugere gerar via gerarDASMEI primeiro. ' +
      'Requer que o cliente seja MEI.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente no sistema.',
        },
        competencia: {
          type: 'string',
          description: 'Competência no formato AAAAMM (opcional). Se omitido, usa a DAS pendente mais recente.',
        },
        canal: {
          type: 'string',
          enum: ['whatsapp', 'email', 'ambos'],
          description: 'Canal de envio. Padrão: "ambos" (usa os disponíveis).',
        },
      },
      required: ['clienteId'],
    },
  },

  meta: {
    label:     'Enviar DAS MEI ao Cliente',
    descricao: 'Envia código de barras/link da DAS MEI ao cliente via WhatsApp ou email.',
    categoria: 'Receita Federal (SERPRO)',
    canais:    ['crm'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId  = input.clienteId as string | undefined
    const competencia = input.competencia as string | undefined
    const canal       = (input.canal as string | undefined) ?? 'ambos'

    if (!clienteId) {
      return { sucesso: false, erro: 'clienteId obrigatório.', resumo: 'clienteId não informado.' }
    }

    try {
      const cliente = await prisma.cliente.findUnique({
        where:  { id: clienteId },
        select: {
          nome:     true,
          email:    true,
          whatsapp: true,
          empresa: {
            select: {
              regime: true,
              dasMeis: {
                where: competencia
                  ? { competencia }
                  : { status: { in: ['pendente', 'vencida'] } },
                orderBy: { competencia: 'desc' },
                take:    1,
                select: {
                  id:             true,
                  competencia:    true,
                  valor:          true,
                  dataVencimento: true,
                  codigoBarras:   true,
                  urlDas:         true,
                  status:         true,
                },
              },
            },
          },
        },
      })

      if (!cliente) {
        return { sucesso: false, erro: 'Cliente não encontrado.', resumo: 'Cliente não encontrado.' }
      }
      if (cliente.empresa?.regime !== 'MEI') {
        return { sucesso: false, erro: 'Cliente não é MEI.', resumo: `${cliente.nome} não é MEI — DAS não aplicável.` }
      }

      const das = cliente.empresa.dasMeis?.[0]
      if (!das) {
        const msg = competencia
          ? `DAS de ${competencia.slice(4, 6)}/${competencia.slice(0, 4)} não encontrada. Gere primeiro via gerarDASMEI.`
          : 'Nenhuma DAS pendente encontrada. Gere primeiro via gerarDASMEI.'
        return { sucesso: false, erro: msg, resumo: msg }
      }

      const comp  = `${das.competencia.slice(4, 6)}/${das.competencia.slice(0, 4)}`
      const valor = das.valor != null ? `R$ ${Number(das.valor).toFixed(2)}` : ''
      const venc  = das.dataVencimento ? new Date(das.dataVencimento).toLocaleDateString('pt-BR') : ''

      const enviados: string[] = []

      // E-mail
      if ((canal === 'email' || canal === 'ambos') && cliente.email) {
        try {
          await sendEmail({
            para:    cliente.email,
            assunto: `DAS MEI — ${comp}`,
            corpo:   `
              <p>Olá, <strong>${cliente.nome}</strong>!</p>
              <p>Segue a DAS MEI referente a <strong>${comp}</strong>.</p>
              <ul>
                ${valor ? `<li><strong>Valor:</strong> ${valor}</li>` : ''}
                ${venc  ? `<li><strong>Vencimento:</strong> ${venc}</li>` : ''}
                ${das.codigoBarras ? `<li><strong>Código de barras:</strong> <code>${das.codigoBarras}</code></li>` : ''}
                ${das.urlDas ? `<li><a href="${das.urlDas}">Clique aqui para baixar a DAS</a></li>` : ''}
              </ul>
            `,
          })
          enviados.push('email')
        } catch (e) {
          Sentry.captureException(e, { tags: { module: 'tool-enviar-das-mei-cliente', operation: 'email' } })
        }
      }

      // WhatsApp
      if ((canal === 'whatsapp' || canal === 'ambos') && cliente.whatsapp) {
        try {
          const cfgRow = await prisma.escritorio.findFirst({
            select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
          })
          if (cfgRow?.evolutionApiUrl && cfgRow.evolutionApiKey && cfgRow.evolutionInstance) {
            const evoCfg: EvolutionConfig = {
              baseUrl:  cfgRow.evolutionApiUrl,
              apiKey:   isEncrypted(cfgRow.evolutionApiKey) ? decrypt(cfgRow.evolutionApiKey) : cfgRow.evolutionApiKey,
              instance: cfgRow.evolutionInstance,
            }
            const jid = buildRemoteJid(cliente.whatsapp)
            if (jid) {
              const msg = [
                `*DAS MEI — ${comp}*`,
                valor ? `Valor: ${valor}` : '',
                venc  ? `Vencimento: ${venc}` : '',
                das.codigoBarras ? `Código de barras:\n${das.codigoBarras}` : '',
                das.urlDas ? `Link para pagamento: ${das.urlDas}` : '',
              ].filter(Boolean).join('\n')
              await sendText(evoCfg, jid, msg)
              enviados.push('WhatsApp')
            }
          }
        } catch (e) {
          Sentry.captureException(e, { tags: { module: 'tool-enviar-das-mei-cliente', operation: 'whatsapp' } })
        }
      }

      if (enviados.length === 0) {
        return {
          sucesso: false,
          erro:    'Nenhum canal disponível (email ou WhatsApp não configurados/disponíveis).',
          resumo:  'DAS não enviada — sem canal disponível.',
        }
      }

      return {
        sucesso: true,
        dados:   { das, enviados },
        resumo:  `DAS MEI de ${comp} enviada para ${cliente.nome} via ${enviados.join(' e ')}.`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, {
        tags:  { module: 'tool-enviar-das-mei-cliente', operation: 'execute' },
        extra: { clienteId },
      })
      return {
        sucesso: false,
        erro:    msg,
        resumo:  `Erro ao enviar DAS MEI: ${msg}`,
      }
    }
  },
}

registrarTool(enviarDASMEIClienteTool)
