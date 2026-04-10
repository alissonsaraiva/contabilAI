/**
 * POST /api/cron/gerar-das-mei
 *
 * Cron diário que gera automaticamente a DAS MEI para todos os clientes
 * MEI com procuração ativa no sistema, quando estiver dentro da janela
 * de antecedência configurada (dasMeiDiasAntecedencia dias antes do vencimento).
 *
 * Lógica:
 *   1. Carrega configuração do escritório (vencimentoDia, diasAntecedencia)
 *   2. Calcula se hoje cai dentro da janela de geração para o mês corrente
 *   3. Para cada cliente MEI com procuracaoRFAtiva = true:
 *      a. Verifica se DAS do mês já existe
 *      b. Se não, chama gerarESalvarDASMEI (gera + salva + notifica)
 *      c. Erros por cliente são capturados individualmente (não interrompem o batch)
 *   4. Notifica admin por e-mail se houver erros no batch
 *
 * Setup crontab (VPS — usuário: deploy):
 * 0 8 * * * curl -s -X POST https://dominio/api/cron/gerar-das-mei -H "Authorization: Bearer $CRON_SECRET"
 */
// CRON: 0 8 * * * curl -s -X POST https://dominio/api/cron/gerar-das-mei -H "Authorization: Bearer $CRON_SECRET"

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { gerarESalvarDASMEI } from '@/lib/services/das-mei'
import { sendEmail } from '@/lib/email/send'
import { hc } from '@/lib/healthchecks'

export const maxDuration = 300  // 5 min — batch pode ser longo

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  void hc.start(process.env.HC_GERAR_DAS_MEI)

  const agora = new Date()
  const diaHoje = agora.getDate()

  let geradas  = 0
  let jaExistiam = 0
  let erros    = 0
  const errosDetalhe: string[] = []

  try {
    // Carrega config do escritório
    const cfg = await prisma.escritorio.findFirst({
      select: {
        dasMeiVencimentoDia:    true,
        dasMeiDiasAntecedencia: true,
        integraContadorEnabled: true,
        emailRemetente:         true,
        emailNome:              true,
      },
    })

    if (!cfg?.integraContadorEnabled) {
      void hc.ok(process.env.HC_GERAR_DAS_MEI)
      return NextResponse.json({ ok: true, msg: 'Integra Contador desabilitado — nada a fazer' })
    }

    const vencDia    = cfg.dasMeiVencimentoDia    ?? 20
    const diasAnt    = cfg.dasMeiDiasAntecedencia ?? 5
    // Clampado a 1 para evitar diaGeracao ≤ 0 quando vencDia < diasAnt
    const diaGeracao = Math.max(1, vencDia - diasAnt)

    // Verifica se hoje é o dia de geração (ou entre o dia de geração e o vencimento)
    if (diaHoje < diaGeracao) {
      void hc.ok(process.env.HC_GERAR_DAS_MEI)
      return NextResponse.json({
        ok:  true,
        msg: `Hoje é dia ${diaHoje}. Geração começa no dia ${diaGeracao}. Nada a fazer.`,
      })
    }

    // Competência = mês corrente (AAAAMM)
    const ano = agora.getFullYear()
    const mes = String(agora.getMonth() + 1).padStart(2, '0')
    const competencia = `${ano}${mes}`

    // Busca TODAS as empresas MEI com procuração ativa (via junção 1:N)
    // Inclui empresas vinculadas como secundárias que antes eram invisíveis
    const vinculos = await prisma.clienteEmpresa.findMany({
      where: {
        cliente: { status: { not: 'cancelado' } },
        empresa: {
          regime:           'MEI',
          procuracaoRFAtiva: true,
          cnpj:             { not: null },
        },
      },
      select: {
        clienteId: true,
        empresaId: true,
        cliente:   { select: { nome: true } },
        empresa: {
          select: {
            cnpj:    true,
            dasMeis: {
              where:  { competencia },
              select: { id: true, status: true },
              take:   1,
            },
          },
        },
      },
    })

    for (const vinculo of vinculos) {
      // Já existe DAS para esta competência e não é erro
      const dasExistente = vinculo.empresa.dasMeis[0]
      if (dasExistente && dasExistente.status !== 'erro') {
        jaExistiam++
        continue
      }

      try {
        await gerarESalvarDASMEI(vinculo.clienteId, competencia, vinculo.empresaId)
        geradas++
      } catch (err) {
        erros++
        const msg = err instanceof Error ? err.message : String(err)
        errosDetalhe.push(`${vinculo.cliente.nome} (${vinculo.empresa.cnpj}): ${msg}`)
        Sentry.captureException(err, {
          tags:  { module: 'cron-gerar-das-mei', operation: 'gerar-cliente' },
          extra: { clienteId: vinculo.clienteId, empresaId: vinculo.empresaId, competencia },
        })
      }
    }

    // Notifica admin se houver erros
    if (erros > 0 && cfg.emailRemetente) {
      await sendEmail({
        para:    cfg.emailRemetente,
        assunto: `[AVOS] Erros ao gerar DAS MEI — ${competencia}`,
        corpo:   `
          <p>O cron de geração de DAS MEI encontrou <strong>${erros} erro(s)</strong> em ${new Date().toLocaleDateString('pt-BR')}.</p>
          <ul>${errosDetalhe.map(e => `<li>${e}</li>`).join('')}</ul>
          <p>Verifique o Sentry para mais detalhes ou gere manualmente pelo CRM.</p>
        `,
      }).catch(() => {})
    }

    void hc.ok(process.env.HC_GERAR_DAS_MEI)
    return NextResponse.json({ ok: true, geradas, jaExistiam, erros, competencia })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags: { module: 'cron-gerar-das-mei', operation: 'batch' },
    })
    void hc.fail(process.env.HC_GERAR_DAS_MEI)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
