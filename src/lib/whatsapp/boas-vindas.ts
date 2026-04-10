/**
 * Envia mensagem de boas-vindas via WhatsApp após conversão Lead→Cliente.
 * Complementa o e-mail (que pode ir para spam) com notificação instantânea.
 *
 * Chamado como fire-and-forget no webhook ZapSign — falhas não bloqueiam o fluxo.
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { sendText } from '@/lib/evolution'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { criarTokenPortal } from '@/lib/portal/tokens'

type ClienteBasico = {
  id:     string
  nome:   string
  telefone?: string | null
  empresaId?: string | null
}

export async function enviarBoasVindasWhatsApp(cliente: ClienteBasico): Promise<void> {
  if (!cliente.telefone) {
    // Sem telefone — não há como enviar; e-mail é o único canal
    return
  }

  const row = await prisma.escritorio.findFirst({
    select: {
      nome: true,
      evolutionApiUrl: true,
      evolutionApiKey: true,
      evolutionInstance: true,
      whatsappAiEnabled: true,
    },
  })

  if (!row?.evolutionApiUrl || !row.evolutionApiKey || !row.evolutionInstance) {
    // WhatsApp não configurado — ignora silenciosamente
    return
  }

  const rawKey = row.evolutionApiKey
  const cfg = {
    baseUrl:  row.evolutionApiUrl,
    apiKey:   rawKey ? (isEncrypted(rawKey) ? decrypt(rawKey) : rawKey) : (process.env.EVOLUTION_API_KEY ?? ''),
    instance: row.evolutionInstance,
  }

  const nomeEscritorio = row.nome ?? 'Avos'
  const primeiroNome   = cliente.nome.split(' ')[0]

  // Resolve empresaId: param direto → fallback junção 1:N
  let empresaId = cliente.empresaId ?? null
  if (!empresaId) {
    const vinculo = await prisma.clienteEmpresa.findFirst({
      where: { clienteId: cliente.id, principal: true },
      select: { empresaId: true },
    })
    empresaId = vinculo?.empresaId ?? null
  }

  // Gera link de acesso ao portal (válido 48h — mais folgado para o canal WhatsApp)
  let link = ''
  if (!empresaId) {
    console.warn('[wa-boas-vindas] Cliente sem empresa vinculada, link do portal não gerado:', { clienteId: cliente.id })
  } else try {
    const token = await criarTokenPortal(cliente.id, empresaId, 48 * 60 * 60 * 1000)
    link = token.link
  } catch (err) {
    console.error('[wa-boas-vindas] Falha ao gerar token de portal:', { clienteId: cliente.id, err })
    Sentry.captureException(err, {
      tags:  { module: 'whatsapp-boas-vindas', operation: 'criar-token' },
      extra: { clienteId: cliente.id },
    })
    // Continua sem link — mensagem ainda tem valor informativo
  }

  const telefone = cliente.telefone.replace(/\D/g, '')
  const jid      = telefone.startsWith('55') ? `${telefone}@s.whatsapp.net` : `55${telefone}@s.whatsapp.net`

  const texto = link
    ? `✅ *Bem-vindo(a) ao ${nomeEscritorio}, ${primeiroNome}!*\n\nSeu contrato foi assinado e sua conta está ativa. Acesse seu portal exclusivo pelo link abaixo:\n\n${link}\n\n_Link válido por 48 horas. Após isso, solicite um novo na tela de login._`
    : `✅ *Bem-vindo(a) ao ${nomeEscritorio}, ${primeiroNome}!*\n\nSeu contrato foi assinado e sua conta está ativa. Você receberá um e-mail com o link de acesso ao seu portal em breve.`

  try {
    const result = await sendText(cfg, jid, texto)
    if (!result.ok) {
      console.error('[wa-boas-vindas] Falha ao enviar mensagem:', { clienteId: cliente.id, erro: result.error })
      Sentry.captureMessage('WhatsApp boas-vindas: falha no envio', {
        level: 'warning',
        tags:  { module: 'whatsapp-boas-vindas', operation: 'send-text' },
        extra: { clienteId: cliente.id, erro: result.error },
      })
    }
  } catch (err) {
    console.error('[wa-boas-vindas] Erro ao enviar mensagem:', { clienteId: cliente.id, err })
    Sentry.captureException(err, {
      tags:  { module: 'whatsapp-boas-vindas', operation: 'send-text' },
      extra: { clienteId: cliente.id },
    })
  }
}
