import { prisma } from '@/lib/prisma'
import { sendText } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

function extrairTelefone(lead: { contatoEntrada: string; dadosJson: unknown }): string | null {
  const dados      = lead.dadosJson as Record<string, string> | null
  const candidatos = [
    dados?.['WhatsApp'],
    dados?.['Telefone'],
    dados?.['Celular'],
    /^\+?[\d\s()\-]{8,}$/.test(lead.contatoEntrada) ? lead.contatoEntrada : null,
  ]
  return candidatos.find(v => v && v.replace(/\D/g, '').length >= 8) ?? null
}

function buildRemoteJid(phone: string): string {
  const digits      = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

// Deduplicação: evita reenvio acidental da mesma mensagem para o mesmo número em 90s
const _enviados = new Map<string, number>()
function jáEnviado(phone: string, mensagem: string): boolean {
  const chave = `${phone.replace(/\D/g, '')}::${mensagem.slice(0, 40)}`
  const ultimo = _enviados.get(chave)
  if (ultimo && Date.now() - ultimo < 90_000) return true
  _enviados.set(chave, Date.now())
  for (const [k, ts] of _enviados) {
    if (Date.now() - ts > 90_000) _enviados.delete(k)
  }
  return false
}

const enviarWhatsAppLeadTool: Tool = {
  definition: {
    name: 'enviarWhatsAppLead',
    description:
      'Envia uma mensagem WhatsApp proativa para um lead em prospecção ou onboarding. Use quando o operador disser "manda um zap pro lead", "envia whatsapp para o lead X", "avisa o lead pelo zap que...", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: {
          type: 'string',
          description: 'ID do lead para quem enviar a mensagem.',
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
    label: 'WhatsApp → Lead',
    descricao: 'Envia mensagem WhatsApp proativa para um lead em prospecção ou onboarding via Evolution API.',
    categoria: 'Funil',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const mensagem = input.mensagem  as string
    const leadId   = (input.leadId as string | undefined) ?? ctx.leadId

    if (!leadId) {
      return {
        sucesso: false,
        erro:   'leadId não fornecido.',
        resumo: 'Lead não identificado para envio de WhatsApp.',
      }
    }

    const lead = await prisma.lead.findUnique({
      where:  { id: leadId },
      select: { id: true, contatoEntrada: true, dadosJson: true },
    })

    if (!lead) {
      return { sucesso: false, erro: 'Lead não encontrado.', resumo: 'Lead não encontrado.' }
    }

    const phone = extrairTelefone(lead)
    if (!phone) {
      return {
        sucesso: false,
        erro:   'Lead sem número de WhatsApp identificável.',
        resumo: 'Não foi possível identificar o telefone do lead.',
      }
    }

    if (jáEnviado(phone, mensagem)) {
      const dados2 = lead.dadosJson as Record<string, unknown> | null
      const nomeLead2 = (dados2?.nome as string | undefined) ?? lead.contatoEntrada
      return {
        sucesso: true,
        dados:   { deduplicado: true },
        resumo:  `Mensagem idêntica para lead "${nomeLead2}" já enviada nos últimos 90 segundos — ignorado para evitar duplicata.`,
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

    const rawKey    = row.evolutionApiKey
    const apiKey    = isEncrypted(rawKey) ? decrypt(rawKey) : rawKey
    const remoteJid = buildRemoteJid(phone)

    let conversa = await prisma.conversaIA.findFirst({
      where:   { canal: 'whatsapp', remoteJid },
      orderBy: { atualizadaEm: 'desc' },
      select:  { id: true },
    })

    if (!conversa) {
      conversa = await prisma.conversaIA.create({
        data:   { canal: 'whatsapp', remoteJid, leadId },
        select: { id: true },
      })
    }

    const sendResult = await sendText(
      { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance },
      remoteJid,
      mensagem,
    )

    await Promise.all([
      prisma.interacao.create({
        data: {
          leadId,
          tipo:     'whatsapp_enviado',
          titulo:   'WhatsApp enviado pelo Agente',
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
        resumo: 'Falha ao entregar WhatsApp para o lead.',
      }
    }

    const dados    = lead.dadosJson as Record<string, unknown> | null
    const nomeLead = (dados?.nome as string | undefined) ?? lead.contatoEntrada

    return {
      sucesso: true,
      dados:   { leadId, conversaId: conversa.id },
      resumo:  `WhatsApp enviado para lead "${nomeLead}" (${phone}): "${mensagem.slice(0, 60)}${mensagem.length > 60 ? '...' : ''}"`,
    }
  },
}

registrarTool(enviarWhatsAppLeadTool)
