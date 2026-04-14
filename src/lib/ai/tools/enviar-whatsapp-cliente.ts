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

// Deduplicação em memória — cobre reenvios rápidos no mesmo processo (restart = limpa)
// Complementada pela verificação no DB abaixo, que persiste entre restarts.
const _enviadosMemoria = new Map<string, number>()
function jáEnviadoMemoria(phone: string, mensagem: string): boolean {
  const chave = `${phone.replace(/\D/g, '')}::${mensagem.slice(0, 40)}`
  const ultimo = _enviadosMemoria.get(chave)
  if (ultimo && Date.now() - ultimo < 90_000) return true
  _enviadosMemoria.set(chave, Date.now())
  for (const [k, ts] of _enviadosMemoria) {
    if (Date.now() - ts > 90_000) _enviadosMemoria.delete(k)
  }
  return false
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

    const phone = cliente.whatsapp
    if (!phone) {
      return {
        sucesso: false,
        erro:   'Cliente sem número de WhatsApp cadastrado.',
        resumo: `Cliente "${cliente.nome}" não tem número de WhatsApp cadastrado.`,
      }
    }

    // Dedup rápido em memória (mesma instância do processo)
    if (jáEnviadoMemoria(phone, mensagem)) {
      return {
        sucesso: false,
        erro:    'Duplicata detectada em memória.',
        resumo:  `Mensagem idêntica para "${cliente.nome}" já enviada nos últimos 90 segundos — ignorada para evitar duplicata.`,
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

    // Busca ou cria conversa (movido para antes do envio para permitir dedup via DB)
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

    // Dedup via DB: persiste entre restarts de servidor/deploy
    // Verifica se já existe mensagem idêntica enviada nos últimos 90s nesta conversa
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
        resumo:  `Mensagem idêntica para "${cliente.nome}" já foi enviada nos últimos 90 segundos (verificado no banco) — ignorada para evitar duplicata.`,
      }
    }

    const sendResult = await sendText(
      { baseUrl: row.evolutionApiUrl, apiKey, instance: row.evolutionInstance },
      remoteJid,
      mensagem,
    )

    // Registra interação e mensagem
    await Promise.all([
      registrarInteracao({
        clienteId,
        tipo:     'whatsapp_enviado',
        titulo:   'WhatsApp enviado pelo Agente',
        conteudo: mensagem,
        origem:   'usuario',
        metadados: { registradoPorAI: true, solicitante: ctx.solicitanteAI },
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
