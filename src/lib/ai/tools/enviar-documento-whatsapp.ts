import { prisma } from '@/lib/prisma'
import { sendMedia } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { prepararEntregaWhatsApp } from '@/lib/whatsapp/entregar-documento'
import { registrarInteracao } from '@/lib/services/interacoes'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

function buildRemoteJid(phone: string): string {
  const digits      = phone.replace(/\D/g, '')
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `${withCountry}@s.whatsapp.net`
}

const enviarDocumentoWhatsAppTool: Tool = {
  definition: {
    name: 'enviarDocumentoWhatsApp',
    description:
      'Envia um documento (nota fiscal, boleto, contrato, comprovante) via WhatsApp para um cliente ou lead. Use junto com buscarDocumentos para encontrar o documentoId. Use quando o cliente pedir "me manda minha nota fiscal", "envia o boleto no zap", "quero o contrato pelo whatsapp", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        documentoId: {
          type: 'string',
          description: 'ID do documento a enviar (obtido via buscarDocumentos).',
        },
        clienteId: {
          type: 'string',
          description: 'ID do cliente destinatário (opcional se já no contexto).',
        },
        leadId: {
          type: 'string',
          description: 'ID do lead destinatário (opcional se já no contexto).',
        },
        mensagem: {
          type: 'string',
          description: 'Mensagem/legenda a enviar junto com o documento. Opcional.',
        },
      },
      required: ['documentoId'],
    },
  },

  meta: {
    label: 'Enviar documento via WhatsApp',
    descricao: 'Envia nota fiscal, boleto, contrato ou qualquer documento ao cliente via WhatsApp.',
    categoria: 'Clientes',
    canais: ['crm', 'whatsapp'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const documentoId = input.documentoId as string
    const mensagem    = input.mensagem    as string | undefined
    const clienteId   = (input.clienteId as string | undefined) ?? ctx.clienteId
    const leadId      = (input.leadId    as string | undefined) ?? ctx.leadId

    // 1. Busca o documento
    const documento = await prisma.documento.findUnique({
      where:  { id: documentoId },
      select: { id: true, nome: true, tipo: true, url: true, mimeType: true, clienteId: true, leadId: true },
    })

    if (!documento) {
      return {
        sucesso: false,
        erro:   `Documento ${documentoId} não encontrado.`,
        resumo: 'Documento não encontrado.',
      }
    }

    // 2. Determina destinatário: prioriza contexto, depois documento
    const destClienteId = clienteId ?? documento.clienteId ?? undefined
    const destLeadId    = leadId    ?? documento.leadId    ?? undefined

    // 3. Busca número do telefone
    let phone: string | null = null

    if (destClienteId) {
      const cliente = await prisma.cliente.findUnique({
        where:  { id: destClienteId },
        select: { whatsapp: true, telefone: true, nome: true },
      })
      phone = cliente?.whatsapp ?? cliente?.telefone ?? null
    } else if (destLeadId) {
      const lead = await prisma.lead.findUnique({
        where:  { id: destLeadId },
        select: { contatoEntrada: true, dadosJson: true },
      })
      if (lead) {
        const dados      = lead.dadosJson as Record<string, string> | null
        const candidatos = [
          dados?.['WhatsApp'],
          dados?.['Telefone'],
          dados?.['Celular'],
          /^\+?[\d\s()\-]{8,}$/.test(lead.contatoEntrada) ? lead.contatoEntrada : null,
        ]
        phone = candidatos.find(v => v && v.replace(/\D/g, '').length >= 8) ?? null
      }
    }

    if (!phone) {
      return {
        sucesso: false,
        erro:   'Destinatário sem número de WhatsApp cadastrado.',
        resumo: 'Não foi possível identificar o número de WhatsApp do destinatário.',
      }
    }

    // 4. Carrega config Evolution
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

    // 5. Prepara entrega (aplica estratégia configurada: direto | senha | link_portal)
    const entrega = await prepararEntregaWhatsApp(
      { id: documento.id, nome: documento.nome, url: documento.url, mimeType: documento.mimeType, tipo: documento.tipo },
      { mensagem },
    )

    const sendResult = await sendMedia(
      { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance },
      remoteJid,
      entrega.sendMediaParams,
    )

    // 6. Registra como interação
    await registrarInteracao({
      clienteId: destClienteId ?? undefined,
      leadId:    destLeadId    ?? undefined,
      tipo:      'whatsapp_enviado',
      titulo:    `Documento enviado via WhatsApp: ${documento.nome}`,
      conteudo:  mensagem,
      origem:    'usuario',
      metadados: {
        documentoId:     documento.id,
        documentoNome:   documento.nome,
        documentoTipo:   documento.tipo,
        estrategiaEntrega: entrega.estrategia,
        registradoPorAI: true,
        solicitante:     ctx.solicitanteAI,
      },
    })

    if (!sendResult.ok) {
      return {
        sucesso: false,
        erro:   `Falha ao entregar documento: ${(sendResult as any).error}`,
        resumo: `O documento "${documento.nome}" foi registrado mas falhou ao entregar via WhatsApp.`,
      }
    }

    return {
      sucesso: true,
      dados:   { documentoId, phone },
      resumo:  `Documento "${documento.nome}" (${documento.tipo}) enviado via WhatsApp para ${phone}${mensagem ? ` com mensagem: "${mensagem}"` : ''}.`,
    }
  },
}

registrarTool(enviarDocumentoWhatsAppTool)
