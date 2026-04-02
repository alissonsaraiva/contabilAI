/**
 * POST /api/crm/inadimplentes/mensagem
 *
 * Envia mensagem de cobrança via WhatsApp para um ou mais clientes inadimplentes.
 * Body: { clienteIds: string[], nivel: 'gentil' | 'urgente' | 'reforco' }
 */
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { sendText } from '@/lib/evolution'
import type { EvolutionConfig } from '@/lib/evolution'

// PIX do Asaas expira em 24h — usamos 20h como margem de segurança
const PIX_EXPIRACAO_MS = 20 * 60 * 60 * 1000

type Nivel = 'gentil' | 'urgente' | 'reforco'

function montarMensagem(nome: string, valor: string, dataVenc: string, nivel: Nivel, pagamento: string, nomeEsc: string): string {
  if (nivel === 'gentil') {
    return `Olá, ${nome}! 😊\n\nPassamos para lembrar que há uma cobrança em aberto de *${valor}* com vencimento em *${dataVenc}*.\n\nPara regularizar:\n${pagamento}\n\nQualquer dúvida, estamos à disposição! 🙏\n— ${nomeEsc}`
  }
  if (nivel === 'urgente') {
    return `Olá, ${nome}. ⚠️\n\nA cobrança de *${valor}* (vencida em *${dataVenc}*) ainda não foi regularizada.\n\nPedimos que efetue o pagamento o quanto antes para evitar a suspensão dos serviços contábeis.\n\n${pagamento}\n\nEm caso de dificuldades, entre em contato conosco.\n— ${nomeEsc}`
  }
  return `${nome}, atenção. 🚨\n\nSua cobrança de *${valor}* permanece em aberto (vencimento: *${dataVenc}*).\n\nPara evitar impactos nos seus serviços, regularize agora:\n${pagamento}\n\nSe precisar negociar, entre em contato com urgência.\n— ${nomeEsc}`
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body       = await req.json()
  const clienteIds = body.clienteIds as string[]
  const nivel      = (body.nivel as Nivel) ?? 'gentil'

  if (!clienteIds?.length) {
    return NextResponse.json({ error: 'clienteIds obrigatório' }, { status: 400 })
  }

  const esc = await prisma.escritorio.findFirst({
    select: { nomeFantasia: true, nome: true, evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
  })

  if (!esc?.evolutionApiUrl || !esc.evolutionApiKey || !esc.evolutionInstance) {
    return NextResponse.json({ error: 'Evolution API não configurado' }, { status: 500 })
  }

  const rawKey = esc.evolutionApiKey
  const evoCfg: EvolutionConfig = {
    baseUrl:  esc.evolutionApiUrl,
    apiKey:   isEncrypted(rawKey) ? decrypt(rawKey) : rawKey,
    instance: esc.evolutionInstance,
  }
  const nomeEsc = esc.nomeFantasia ?? esc.nome ?? 'Nosso escritório'

  const clientes = await prisma.cliente.findMany({
    where: { id: { in: clienteIds } },
    select: {
      id: true, nome: true, whatsapp: true, telefone: true,
      empresa: {
        select: {
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
        select:  { id: true, valor: true, vencimento: true, linkBoleto: true, pixCopiaECola: true, atualizadoEm: true },
      },
    },
  })

  const results: { clienteId: string; ok: boolean; erro?: string }[] = []
  // nivelKey é a chave canônica usada para deduplicação (mesmo formato que o cron)
  const tituloNivel = nivel // 'gentil' | 'urgente' | 'reforco'

  for (const c of clientes) {
    const cobranca = c.cobrancasAsaas[0] ?? null
    if (!cobranca) {
      results.push({ clienteId: c.id, ok: false, erro: 'Sem cobrança em aberto' })
      continue
    }

    const socioP   = c.empresa?.socios[0] ?? null
    const destWA   = socioP?.whatsapp ?? socioP?.telefone ?? c.whatsapp ?? c.telefone ?? null
    const nomeDest = socioP?.nome ?? c.nome

    if (!destWA) {
      results.push({ clienteId: c.id, ok: false, erro: 'Sem WhatsApp cadastrado' })
      continue
    }

    try {
      // M2: verifica expiração do PIX antes de incluir na mensagem
      const pixValido =
        !!cobranca.pixCopiaECola &&
        !!cobranca.atualizadoEm &&
        Date.now() - new Date(cobranca.atualizadoEm).getTime() < PIX_EXPIRACAO_MS

      const pagStr = pixValido
        ? `*PIX Copia e Cola:*\n${cobranca.pixCopiaECola}`
        : cobranca.linkBoleto
        ? `Acesse o boleto: ${cobranca.linkBoleto}`
        : 'Entre em contato com o escritório para obter uma nova via de pagamento.'

      const valor    = Number(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const dataVenc = new Date(cobranca.vencimento).toLocaleDateString('pt-BR')
      const mensagem = montarMensagem(nomeDest, valor, dataVenc, nivel, pagStr, nomeEsc)
      const numero   = destWA.replace(/\D/g, '')

      await sendText(evoCfg, `${numero}@s.whatsapp.net`, mensagem)

      await prisma.interacao.create({
        data: {
          clienteId: c.id,
          tipo:      'whatsapp_enviado',
          titulo:    `Cobrança ${cobranca.id} — ${tituloNivel}`,
          conteudo:  mensagem,
          origem:    'crm_manual',
          usuarioId: session.user?.id ?? null,
        },
      }).catch((err: unknown) =>
        console.error('[crm/inadimplentes/mensagem] erro ao registrar interação:', { clienteId: c.id, err }),
      )

      results.push({ clienteId: c.id, ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[crm/inadimplentes/mensagem] Erro ao enviar para cliente ${c.id}:`, err)
      Sentry.captureException(err, {
        tags:  { module: 'crm-inadimplentes', operation: 'enviar-mensagem-whatsapp' },
        extra: { clienteId: c.id, nivel },
      })
      results.push({ clienteId: c.id, ok: false, erro: msg })
    }
  }

  const enviados  = results.filter(r => r.ok).length
  const erros     = results.filter(r => !r.ok)

  return NextResponse.json({ ok: true, enviados, erros: erros.length ? erros : undefined })
}
