/**
 * POST /api/cron/escalonamento-inadimplentes
 *
 * Cron diário que envia mensagens de cobrança via WhatsApp para clientes inadimplentes.
 * A Asaas já envia email no D+0 (PAYMENT_OVERDUE) e lembretes periódicos por email.
 * Este cron complementa com WhatsApp nos momentos de maior urgência:
 *   D+7  → mensagem urgente (risco de suspensão)
 *   D+15 → reforço urgente
 *
 * O webhook PAYMENT_OVERDUE já envia o primeiro WhatsApp no D+0.
 *
 * Cada escalonamento é registrado como Interacao com titulo 'Cobrança {id} — urgente|reforco'
 * para evitar reenvios (compatível com envio manual do CRM e tool da IA).
 *
 * Setup crontab (VPS):
 *   0 12 * * * curl -s -X POST https://dominio/api/cron/escalonamento-inadimplentes \
 *     -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt, isEncrypted } from '@/lib/crypto'
import { sendText } from '@/lib/evolution'
import type { EvolutionConfig } from '@/lib/evolution'

export const maxDuration = 55

// ─── Mensagens ───────────────────────────────────────────────────────────────

function montarMensagem(
  nome: string,
  valor: string,
  dataVenc: string,
  nivel: 'urgente' | 'reforco',
  pagamento: string,
  nomeEscritorio: string,
): string {
  if (nivel === 'urgente') {
    return `Olá, ${nome}. ⚠️\n\nA cobrança de *${valor}* (vencida em *${dataVenc}*) ainda não foi regularizada.\n\nPedimos que efetue o pagamento o quanto antes para evitar a suspensão dos serviços contábeis.\n\n${pagamento}\n\nEm caso de dificuldades, entre em contato conosco.\n— ${nomeEscritorio}`
  }
  return `${nome}, atenção. 🚨\n\nSua cobrança de *${valor}* permanece em aberto (vencimento: *${dataVenc}*).\n\nPara evitar impactos nos seus serviços, regularize agora:\n${pagamento}\n\nSe precisar negociar, entre em contato com urgência.\n— ${nomeEscritorio}`
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const hoje = new Date()

  // Carrega config Evolution + nome do escritório
  const esc = await prisma.escritorio.findFirst({
    select: {
      nomeFantasia:     true,
      nome:             true,
      evolutionApiUrl:  true,
      evolutionApiKey:  true,
      evolutionInstance: true,
    },
  })

  if (!esc?.evolutionApiUrl || !esc.evolutionApiKey || !esc.evolutionInstance) {
    return NextResponse.json({ ok: false, erro: 'Evolution API não configurado' })
  }

  const rawKey = esc.evolutionApiKey
  const evoCfg: EvolutionConfig = {
    baseUrl:  esc.evolutionApiUrl,
    apiKey:   isEncrypted(rawKey) ? decrypt(rawKey) : rawKey,
    instance: esc.evolutionInstance,
  }
  const nomeEsc = esc.nomeFantasia ?? esc.nome ?? 'Nosso escritório'

  // Busca clientes inadimplentes com cobrança em aberto
  const clientes = await prisma.cliente.findMany({
    where: { status: 'inadimplente' },
    select: {
      id:       true,
      nome:     true,
      whatsapp: true,
      telefone: true,
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
        select:  { id: true, valor: true, vencimento: true, linkBoleto: true, pixCopiaECola: true },
      },
    },
  })

  let enviados = 0
  let ignorados = 0
  const erros: string[] = []

  for (const c of clientes) {
    const cobranca = (c as any).cobrancasAsaas?.[0]
    if (!cobranca) { ignorados++; continue }

    // Calcula dias em atraso
    const vencimento  = new Date(cobranca.vencimento)
    const diasAtraso  = Math.floor((hoje.getTime() - vencimento.getTime()) / 86400000)
    if (diasAtraso < 7) { ignorados++; continue }

    // Determina o próximo nível a enviar, do mais antigo para o mais recente.
    // D+0 já foi tratado pelo webhook PAYMENT_OVERDUE (WhatsApp imediato).
    // A Asaas cuida dos lembretes por email — aqui só WhatsApp nos momentos de maior urgência.
    type NivelKey = 'urgente' | 'reforco'
    const escalonamentos: Array<{ minDias: number; key: NivelKey }> = [
      { minDias:  7, key: 'urgente' },
      { minDias: 15, key: 'reforco' },
    ]

    let nivelKey: NivelKey | null = null
    let tituloInteracao = ''
    for (const e of escalonamentos) {
      if (diasAtraso < e.minDias) break
      const titulo = `Cobrança ${cobranca.id} — ${e.key}`
      const jaEnviado = await prisma.interacao.findFirst({
        where:  { clienteId: c.id, titulo },
        select: { id: true },
      })
      if (!jaEnviado) {
        nivelKey = e.key
        tituloInteracao = titulo
        break  // envia o próximo pendente (mais antigo primeiro)
      }
    }

    if (!nivelKey) { ignorados++; continue }

    const nivel = nivelKey

    // Resolve destino WhatsApp: sócio principal → cliente.whatsapp → cliente.telefone
    const socioP = (c as any).empresa?.socios?.[0]
    const destWA = socioP?.whatsapp ?? socioP?.telefone ?? c.whatsapp ?? c.telefone ?? null
    const nomeDest = socioP?.nome ?? c.nome

    if (!destWA) { ignorados++; continue }

    try {
      const pagStr = cobranca.pixCopiaECola
        ? `*PIX Copia e Cola:*\n${cobranca.pixCopiaECola}`
        : cobranca.linkBoleto
        ? `Acesse o boleto: ${cobranca.linkBoleto}`
        : 'Entre em contato conosco para obter uma nova via de pagamento.'

      const valor    = Number(cobranca.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      const dataVenc = vencimento.toLocaleDateString('pt-BR')
      const mensagem = montarMensagem(nomeDest, valor, dataVenc, nivel, pagStr, nomeEsc)

      const numero = destWA.replace(/\D/g, '')
      await sendText(evoCfg, `${numero}@s.whatsapp.net`, mensagem)

      // Registra interação para não reenviar (mesmo formato que CRM manual/IA)
      await prisma.interacao.create({
        data: {
          clienteId: c.id,
          tipo:      'whatsapp_enviado',
          titulo:    tituloInteracao,   // ex: "Cobrança {id} — gentil"
          conteudo:  mensagem,
          origem:    'cron_escalonamento',
        },
      })

      enviados++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      erros.push(`${c.nome}: ${msg}`)
      console.error('[escalonamento-inadimplentes] Erro ao enviar para', c.nome, msg)
      Sentry.captureException(err, { tags: { module: 'cron-escalonamento-inadimplentes' }, extra: { clienteId: c.id, clienteNome: c.nome } })
    }
  }

  return NextResponse.json({
    ok: true,
    enviados,
    ignorados,
    erros: erros.length ? erros : undefined,
  })
}
