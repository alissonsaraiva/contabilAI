/**
 * POST /api/agente/cron
 *
 * Endpoint chamado pelo cron do VPS a cada minuto.
 * Verifica agendamentos vencidos e dispara o executarAgente para cada um.
 *
 * Autenticação: Bearer token via CRON_SECRET no header Authorization.
 *
 * Setup no VPS (crontab):
 *   * * * * * curl -s -X POST https://seudominio.com/api/agente/cron \
 *             -H "Authorization: Bearer $CRON_SECRET" > /dev/null 2>&1
 */

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { executarAgente } from '@/lib/ai/agent'
import { proximoDisparo } from '@/lib/ai/cron-helper'
import { indexarAsync } from '@/lib/rag/indexar-async'
import { notificarAgenteFalhou } from '@/lib/notificacoes'
import '@/lib/ai/tools' // registra todas as tools

// 5 minutos — necessário porque cada executarAgente pode levar até 45s.
// Com maxDuration=60 mesmo 2 agendamentos consecutivos já estouravam o limite.
export const maxDuration = 300

export async function POST(req: Request) {
  // Valida o secret para evitar execuções não autorizadas
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const agora = new Date()

  // ── Manutenção: expirar leads antigos (roda a cada tick, é idempotente) ────
  const limite30d = new Date(agora.getTime() - 30 * 24 * 60 * 60_000)
  const limite15d = new Date(agora.getTime() - 15 * 24 * 60 * 60_000)
  await prisma.lead.updateMany({
    where: {
      status: { in: ['iniciado', 'simulador', 'plano_escolhido', 'dados_preenchidos'] },
      atualizadoEm: { lt: limite30d },
      expiradoEm: null,
    },
    data: { status: 'expirado', expiradoEm: agora },
  }).catch(() => {})
  await prisma.lead.updateMany({
    where: {
      status: { in: ['contrato_gerado', 'aguardando_assinatura'] },
      atualizadoEm: { lt: limite15d },
      expiradoEm: null,
    },
    data: { status: 'expirado', expiradoEm: agora },
  }).catch(() => {})
  // ─────────────────────────────────────────────────────────────────────────

  // Busca no máximo 3 agendamentos por tick — cada executarAgente leva até 45s,
  // então 3 × 45s = 135s cabe dentro dos 300s de maxDuration com margem.
  // Agendamentos que não foram processados neste tick continuam com proximoDisparo
  // vencido e serão capturados no próximo minuto.
  const vencidos = await prisma.agendamentoAgente.findMany({
    where: {
      ativo:          true,
      proximoDisparo: { lte: agora },
    },
    orderBy: { proximoDisparo: 'asc' },  // processa os mais atrasados primeiro
    take:    3,
  })

  if (vencidos.length === 0) {
    return NextResponse.json({ ok: true, disparados: 0 })
  }

  const resultados: { id: string; descricao: string; sucesso: boolean; erro?: string }[] = []

  for (const ag of vencidos) {
    try {
      const resultado = await executarAgente({
        instrucao: ag.instrucao,
        contexto: {
          solicitanteAI: 'crm',
          usuarioId:     ag.criadoPorId   ?? undefined,
          usuarioNome:   ag.criadoPorNome ?? undefined,
        },
        maxIteracoes: 3,  // reduzido de 5 — jobs agendados raramente precisam de mais de 3 iterações
      })

      // Salva resultado como relatório no painel + indexa no RAG
      const relatorio = await prisma.relatorioAgente.create({
        data: {
          titulo:          ag.descricao,
          conteudo:        resultado.resposta,
          tipo:            'agendado',
          sucesso:         resultado.sucesso,
          agendamentoId:   ag.id,
          agendamentoDesc: ag.descricao,
          criadoPorId:     ag.criadoPorId   ?? null,
          criadoPorNome:   ag.criadoPorNome ?? null,
        },
      }).catch((err: unknown) => { console.error('[cron] falha ao salvar relatório:', err); return null })

      if (relatorio) {
        indexarAsync('relatorio', {
          id:              relatorio.id,
          titulo:          ag.descricao,
          conteudo:        resultado.resposta,
          tipo:            'agendado',
          sucesso:         resultado.sucesso,
          agendamentoDesc: ag.descricao,
          criadoPorNome:   ag.criadoPorNome ?? null,
          criadoEm:        relatorio.criadoEm,
        })
      }

      // Calcula próximo disparo
      const proximo = proximoDisparo(ag.cron, agora)

      await prisma.agendamentoAgente.update({
        where: { id: ag.id },
        data: {
          ultimoDisparo:  agora,
          proximoDisparo: proximo ?? undefined,
        },
      })

      resultados.push({ id: ag.id, descricao: ag.descricao, sucesso: resultado.sucesso })

      console.log(`[cron] agendamento "${ag.descricao}" disparado — sucesso: ${resultado.sucesso}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron] erro ao disparar agendamento "${ag.descricao}":`, msg)
      Sentry.captureException(err, { tags: { module: 'cron-agente' }, extra: { agendamentoId: ag.id, descricao: ag.descricao } })
      resultados.push({ id: ag.id, descricao: ag.descricao, sucesso: false, erro: msg })
      notificarAgenteFalhou(`Agendamento "${ag.descricao}" falhou: ${msg}`).catch((notifErr: unknown) =>
        console.error('[cron] erro ao notificar agente_falhou:', { agendamentoId: ag.id, notifErr }),
      )

      // Recalcula próximo mesmo em caso de erro para não ficar preso em loop
      const proximo = proximoDisparo(ag.cron, agora)
      await prisma.agendamentoAgente.update({
        where: { id: ag.id },
        data:  { ultimoDisparo: agora, proximoDisparo: proximo ?? undefined },
      }).catch((err: unknown) =>
        console.error('[cron] erro ao atualizar próximo disparo após falha:', { agendamentoId: ag.id, err }),
      )
    }
  }

  return NextResponse.json({ ok: true, disparados: vencidos.length, resultados })
}
