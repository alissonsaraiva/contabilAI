import { prisma } from '@/lib/prisma'
import { registrarTool } from './registry'
import type { Tool, ToolContext, ToolExecuteResult } from './types'

const enviarLembreteVencimentoTool: Tool = {
  definition: {
    name: 'enviarLembreteVencimento',
    description: 'Envia um lembrete de vencimento de contrato para um cliente ou para múltiplos clientes com vencimento próximo. Use quando o operador quiser notificar clientes sobre cobrança ou quando agendamentos automáticos de lembrete precisarem ser disparados. Envia via e-mail e/ou WhatsApp conforme configuração do cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        clienteId: {
          type: 'string',
          description: 'ID do cliente específico. Se não informado, busca todos os clientes com vencimento nos próximos N dias.',
        },
        diasAntecedencia: {
          type: 'number',
          description: 'Enviar para clientes com vencimento nos próximos N dias (padrão: 5). Ignorado se clienteId for informado.',
        },
        canal: {
          type: 'string',
          enum: ['email', 'whatsapp', 'ambos'],
          description: 'Canal de envio (padrão: ambos se disponível).',
        },
        mensagemCustomizada: {
          type: 'string',
          description: 'Mensagem personalizada para o lembrete. Se não informada, usa template padrão.',
        },
      },
      required: [],
    },
  },

  meta: {
    label: 'Enviar lembrete de vencimento',
    descricao: 'Envia lembrete de vencimento de contrato para um cliente ou para todos com vencimento próximo.',
    categoria: 'Comunicação',
    canais: ['crm'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecuteResult> {
    const clienteId          = (input.clienteId as string | undefined) ?? ctx.clienteId
    const diasAntecedencia   = Number(input.diasAntecedencia ?? 5)
    const canal              = (input.canal as string | undefined) ?? 'ambos'
    const mensagemCustomizada = input.mensagemCustomizada as string | undefined

    // Busca cliente(s) com vencimento próximo
    let clientes: Array<{ id: string; nome: string; email: string; telefone: string | null; whatsapp: string | null; vencimentoDia: number; valorMensal: unknown; planoTipo: string }> = []

    if (clienteId) {
      const c = await prisma.cliente.findUnique({
        where:  { id: clienteId },
        select: { id: true, nome: true, email: true, telefone: true, whatsapp: true, vencimentoDia: true, valorMensal: true, planoTipo: true, status: true },
      }).catch(err => { console.error('[tool/enviar-lembrete] falha ao buscar documento:', err); return null })
      if (!c || c.status !== 'ativo') {
        return { sucesso: false, erro: 'Cliente não encontrado ou não está ativo.', resumo: 'Lembrete não enviado.' }
      }
      clientes = [c]
    } else {
      // Calcula quais dias de vencimento estão nos próximos N dias
      const hoje = new Date()
      const diasAlvo: number[] = []
      for (let d = 0; d <= diasAntecedencia; d++) {
        const data = new Date(hoje)
        data.setDate(data.getDate() + d)
        diasAlvo.push(data.getDate())
      }

      clientes = await prisma.cliente.findMany({
        where:  { status: 'ativo', vencimentoDia: { in: diasAlvo } },
        select: { id: true, nome: true, email: true, telefone: true, whatsapp: true, vencimentoDia: true, valorMensal: true, planoTipo: true },
        take:   50,
      }).catch(err => { console.error('[tool/enviar-lembrete] falha ao buscar documentos:', err); return [] as any[] })
    }

    if (clientes.length === 0) {
      return {
        sucesso: true,
        dados:   { enviados: 0 },
        resumo:  `Nenhum cliente ativo com vencimento nos próximos ${diasAntecedencia} dias.`,
      }
    }

    // Busca config do escritório uma vez antes do loop (evita N+1)
    let evoCfg: { baseUrl: string; apiKey: string; instance: string } | null = null
    if (canal === 'whatsapp' || canal === 'ambos') {
      const { decrypt, isEncrypted } = await import('@/lib/crypto')
      const row = await prisma.escritorio.findFirst({
        select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
      })
      if (row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance) {
        const rawKey = row.evolutionApiKey
        evoCfg = { baseUrl: row.evolutionApiUrl, apiKey: isEncrypted(rawKey) ? decrypt(rawKey) : rawKey, instance: row.evolutionInstance }
      }
    }

    // Envia lembretes via serviços existentes (fire-and-forget por cliente)
    let enviados = 0
    const erros: string[] = []

    for (const c of clientes) {
      const valor = c.valorMensal ? `R$ ${c.valorMensal}` : 'o valor do seu plano'
      const msg = mensagemCustomizada
        ?? `Olá ${c.nome}, este é um lembrete que o vencimento do seu plano ${c.planoTipo} (${valor}) está próximo — dia ${c.vencimentoDia}. Em caso de dúvidas, acesse o portal ou entre em contato conosco.`

      try {
        if ((canal === 'email' || canal === 'ambos') && c.email) {
          await import('@/lib/email/send').then(({ sendEmail }) =>
            sendEmail({
              para:    c.email,
              assunto: `Lembrete: vencimento do seu plano — dia ${c.vencimentoDia}`,
              corpo:   msg,
            })
          )
        }

        if ((canal === 'whatsapp' || canal === 'ambos') && (c.whatsapp ?? c.telefone) && evoCfg) {
          const { sendText } = await import('@/lib/evolution')
          const numero = (c.whatsapp ?? c.telefone)!.replace(/\D/g, '')
          await sendText(evoCfg, `${numero}@s.whatsapp.net`, msg)
        }

        enviados++
      } catch (err) {
        erros.push(`${c.nome}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const resumo = erros.length === 0
      ? `Lembrete enviado para ${enviados} cliente(s).`
      : `Lembrete enviado para ${enviados}/${clientes.length} cliente(s). Erros: ${erros.slice(0, 3).join('; ')}.`

    return { sucesso: enviados > 0, dados: { enviados, total: clientes.length, erros }, resumo }
  },
}

registrarTool(enviarLembreteVencimentoTool)
