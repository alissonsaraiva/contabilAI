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

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { executarAgente } from '@/lib/ai/agent'
import { proximoDisparo } from '@/lib/ai/cron-helper'
import '@/lib/ai/tools' // registra todas as tools

export const maxDuration = 60

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

  // Busca todos os agendamentos ativos com proximoDisparo vencido
  const vencidos = await prisma.agendamentoAgente.findMany({
    where: {
      ativo:          true,
      proximoDisparo: { lte: agora },
    },
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
        maxIteracoes: 5,
      })

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
      resultados.push({ id: ag.id, descricao: ag.descricao, sucesso: false, erro: msg })

      // Recalcula próximo mesmo em caso de erro para não ficar preso em loop
      const proximo = proximoDisparo(ag.cron, agora)
      await prisma.agendamentoAgente.update({
        where: { id: ag.id },
        data:  { ultimoDisparo: agora, proximoDisparo: proximo ?? undefined },
      }).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, disparados: vencidos.length, resultados })
}
