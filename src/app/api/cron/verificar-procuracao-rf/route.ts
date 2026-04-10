/**
 * POST /api/cron/verificar-procuracao-rf
 *
 * Cron diário que verifica no SERPRO (via integra-procuracoes) se cada cliente
 * MEI possui procuração ativa para o escritório.
 *
 * Cadência:
 *   - Clientes com procuracaoRFAtiva = false → verifica sempre (1x/dia)
 *   - Clientes com procuracaoRFAtiva = true  → verifica a cada 30 dias
 *
 * Atualiza procuracaoRFAtiva + procuracaoRFVerificadaEm em Empresa.
 *
 * Se o módulo integra-procuracoes não estiver contratado, o cron aborta com aviso
 * sem falhar o job inteiro.
 *
 * Setup crontab (VPS — usuário: deploy):
 * 0 9 * * * curl -s -X POST https://dominio/api/cron/verificar-procuracao-rf -H "Authorization: Bearer $CRON_SECRET"
 */
// CRON: 0 9 * * * curl -s -X POST https://dominio/api/cron/verificar-procuracao-rf -H "Authorization: Bearer $CRON_SECRET"

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getIntegraContadorConfig, consultarProcuracao } from '@/lib/services/integra-contador'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { hc } from '@/lib/healthchecks'

export const maxDuration = 300

const RECHECK_ATIVA_DIAS = 30

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  void hc.start(process.env.HC_VERIFICAR_PROCURACAO_RF)

  let verificados  = 0
  let ignorados    = 0
  let atualizados  = 0
  let erros        = 0

  try {
    // Carrega configuração do Integra Contador
    const config = await getIntegraContadorConfig()

    if (!config) {
      void hc.ok(process.env.HC_VERIFICAR_PROCURACAO_RF)
      return NextResponse.json({ ok: true, msg: 'Integra Contador não configurado — nada a fazer.' })
    }

    if (!config.modulos.includes('integra-procuracoes')) {
      void hc.ok(process.env.HC_VERIFICAR_PROCURACAO_RF)
      return NextResponse.json({ ok: true, msg: 'Módulo integra-procuracoes não contratado — nada a fazer.' })
    }

    // Carrega CNPJ do escritório (outorgado)
    const escritorio = await prisma.escritorio.findFirst({
      select: { cnpj: true },
    })

    if (!escritorio?.cnpj) {
      void hc.ok(process.env.HC_VERIFICAR_PROCURACAO_RF)
      return NextResponse.json({ ok: true, msg: 'CNPJ do escritório não configurado — não é possível verificar procurações.' })
    }

    const cnpjEscritorio = escritorio.cnpj.replace(/[.\-/\s]/g, '')

    // Janela para re-checar clientes com procuração já ativa
    const limiteRecheck = new Date()
    limiteRecheck.setDate(limiteRecheck.getDate() - RECHECK_ATIVA_DIAS)

    // Busca TODAS as empresas MEI via ClienteEmpresa (suporta multi-empresa)
    const vinculos = await prisma.clienteEmpresa.findMany({
      where: {
        cliente: { status: { not: 'cancelado' } },
        empresa: { regime: 'MEI', cnpj: { not: null } },
      },
      select: {
        clienteId: true,
        empresa: {
          select: {
            id:                      true,
            cnpj:                    true,
            procuracaoRFAtiva:       true,
            procuracaoRFVerificadaEm: true,
          },
        },
        cliente: { select: { nome: true } },
      },
    })

    // Deduplica por empresaId (um cliente pode ter múltiplos vínculos mas empresa é única)
    const empresasMap = new Map<string, typeof vinculos[number]>()
    for (const v of vinculos) {
      if (!empresasMap.has(v.empresa.id)) empresasMap.set(v.empresa.id, v)
    }

    for (const [, vinculo] of empresasMap) {
      const empresa = vinculo.empresa
      const cnpjCliente = empresa.cnpj!.replace(/[.\-/\s]/g, '')

      // Clientes com procuração ativa: só re-verifica após 30 dias
      if (empresa.procuracaoRFAtiva && empresa.procuracaoRFVerificadaEm) {
        if (empresa.procuracaoRFVerificadaEm > limiteRecheck) {
          ignorados++
          continue
        }
      }

      try {
        const resultado = await consultarProcuracao(cnpjCliente, cnpjEscritorio)
        const ativa     = resultado.status === 'ativa'

        const agora = new Date()
        await prisma.empresa.update({
          where: { id: empresa.id },
          data: {
            procuracaoRFAtiva:       ativa,
            procuracaoRFVerificadaEm: agora,
          },
        })

        // Re-indexa no RAG para que as IAs reflitam o novo status de procuração
        indexarAsync('empresa', {
          id:                       empresa.id,
          clienteId:                vinculo.clienteId,
          cnpj:                     empresa.cnpj,
          regime:                   'MEI',
          procuracaoRFAtiva:        ativa,
          procuracaoRFVerificadaEm: agora,
        })

        verificados++
        if (ativa !== empresa.procuracaoRFAtiva) atualizados++

      } catch (err) {
        erros++
        const msg = err instanceof Error ? err.message : String(err)
        Sentry.captureException(err, {
          tags:  { module: 'cron-verificar-procuracao-rf', operation: 'verificar-cliente' },
          extra: { empresaId: empresa.id, cnpjCliente, clienteNome: vinculo.cliente.nome },
        })
        console.error(`[cron-verificar-procuracao-rf] Erro para ${vinculo.cliente.nome} (${cnpjCliente}): ${msg}`)
      }
    }

    void hc.ok(process.env.HC_VERIFICAR_PROCURACAO_RF)
    return NextResponse.json({ ok: true, verificados, ignorados, atualizados, erros })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags: { module: 'cron-verificar-procuracao-rf', operation: 'batch' },
    })
    void hc.fail(process.env.HC_VERIFICAR_PROCURACAO_RF)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
