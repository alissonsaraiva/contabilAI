/**
 * POST /api/cron/verificar-pagamento-das-mei
 *
 * Cron diário que verifica o pagamento das DAS MEI vencidas.
 *
 * Lógica:
 *   - Busca DAS com status = "pendente" e dataVencimento no passado
 *   - Para DAS com 1, 3 ou 5 dias de atraso: verifica pagamento via SERPRO
 *     - Se paga: atualiza para "paga" no banco
 *     - Se não paga: envia alerta ao cliente pelos canais configurados
 *   - Após 5 dias sem pagamento: também notifica admin por e-mail
 *
 * Setup crontab (VPS — usuário: deploy):
 * 0 10 * * * curl -s -X POST https://dominio/api/cron/verificar-pagamento-das-mei -H "Authorization: Bearer $CRON_SECRET"
 */
// CRON: 0 10 * * * curl -s -X POST https://dominio/api/cron/verificar-pagamento-das-mei -H "Authorization: Bearer $CRON_SECRET"

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sincronizarPagamentoDAS, notificarDASAtrasada, getEscritorioConfig } from '@/lib/services/das-mei'
import { sendEmail } from '@/lib/email/send'
import { hc } from '@/lib/healthchecks'

export const maxDuration = 300

/** Dias após o vencimento em que o cron verifica e alerta */
const DIAS_VERIFICACAO = [1, 3, 5] as const

function diffDias(dataVencimento: Date): number {
  const agora  = new Date()
  const hoje   = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const venc   = new Date(dataVencimento.getFullYear(), dataVencimento.getMonth(), dataVencimento.getDate())
  return Math.floor((hoje.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24))
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  void hc.start(process.env.HC_VERIFICAR_PAGAMENTO_DAS_MEI)

  // Só executa se Integra Contador estiver habilitado
  const cfgRow = await prisma.escritorio.findFirst({
    select: { integraContadorEnabled: true },
  })
  if (!cfgRow?.integraContadorEnabled) {
    void hc.ok(process.env.HC_VERIFICAR_PAGAMENTO_DAS_MEI)
    return NextResponse.json({ ok: true, msg: 'Integra Contador desabilitado — nada a fazer' })
  }

  let pagas    = 0
  let atrasadas = 0
  let erros    = 0
  const atrasadasAdmin: string[] = []

  try {
    // DAS pendentes com vencimento no passado (até 10 dias)
    const limiteInferior = new Date()
    limiteInferior.setDate(limiteInferior.getDate() - 10)

    const dasVencidas = await prisma.dasMEI.findMany({
      where: {
        status:        'pendente',
        dataVencimento: { lt: new Date(), gte: limiteInferior },
      },
      include: {
        cliente: { select: { id: true, nome: true, email: true, whatsapp: true } },
        empresa: { select: { cnpj: true } },
      },
    })

    const cfg = await getEscritorioConfig()

    for (const das of dasVencidas) {
      if (!das.dataVencimento) continue

      const dias = diffDias(das.dataVencimento)

      // Só processa nos dias-alvo: 1, 3, 5
      if (!(DIAS_VERIFICACAO as readonly number[]).includes(dias)) continue

      try {
        // Tenta verificar pagamento via SERPRO
        let pago = false
        try {
          const atualizado = await sincronizarPagamentoDAS(das.id)
          pago = atualizado.status === 'paga'
        } catch (syncErr) {
          // Se o módulo integra-pagamento não está contratado ou SERPRO offline,
          // loga mas não interrompe — alerta o cliente normalmente
          console.warn(`[verificar-pagamento-das-mei] Sync falhou para DAS ${das.id}:`, syncErr)
        }

        if (pago) {
          pagas++
          continue
        }

        // DAS ainda não paga — alerta o cliente
        await notificarDASAtrasada(das as any, das.cliente, cfg, dias)
        atrasadas++

        // No dia +5: também notifica admin
        if (dias >= 5) {
          const nomeCnpj = `${das.cliente.nome} (${das.empresa.cnpj ?? 'CNPJ não cadastrado'})`
          atrasadasAdmin.push(nomeCnpj)
        }
      } catch (err) {
        erros++
        Sentry.captureException(err, {
          tags:  { module: 'cron-verificar-pagamento-das', operation: 'processar-das' },
          extra: { dasId: das.id, clienteId: das.clienteId, dias },
        })
      }
    }

    // Notifica admin por e-mail se houver inadimplentes no dia +5
    if (atrasadasAdmin.length > 0) {
      const row = await prisma.escritorio.findFirst({
        select: { emailRemetente: true },
      })
      if (row?.emailRemetente) {
        await sendEmail({
          para:    row.emailRemetente,
          assunto: `[AVOS] DAS MEI com 5+ dias de atraso — ${atrasadasAdmin.length} cliente(s)`,
          corpo:   `
            <p>Os seguintes clientes MEI estão com DAS há <strong>5 ou mais dias</strong> sem pagamento:</p>
            <ul>${atrasadasAdmin.map(n => `<li>${n}</li>`).join('')}</ul>
            <p>Verifique o CRM para mais detalhes e acione os clientes se necessário.</p>
          `,
        }).catch(() => {})
      }
    }

    // Transiciona para 'vencida' DAS que passaram de 10 dias sem pagamento
    // (além da janela de verificação ativa de +1/+3/+5 dias)
    const { count: marcadasVencidas } = await prisma.dasMEI.updateMany({
      where: {
        status:         'pendente',
        dataVencimento: { lt: limiteInferior },
      },
      data: { status: 'vencida', atualizadoEm: new Date() },
    })

    void hc.ok(process.env.HC_VERIFICAR_PAGAMENTO_DAS_MEI)
    return NextResponse.json({ ok: true, pagas, atrasadas, erros, marcadasVencidas })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags: { module: 'cron-verificar-pagamento-das', operation: 'batch' },
    })
    void hc.fail(process.env.HC_VERIFICAR_PAGAMENTO_DAS_MEI)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
