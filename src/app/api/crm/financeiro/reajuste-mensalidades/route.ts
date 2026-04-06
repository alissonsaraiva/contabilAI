/**
 * POST /api/crm/financeiro/reajuste-mensalidades
 *
 * Aplica reajuste percentual no valor da mensalidade de todos os clientes
 * elegíveis (status ativo ou inadimplente). Propaga para o Asaas quando
 * o cliente tiver subscription ativa.
 *
 * Acesso restrito a administradores.
 *
 * Body: { percentual: number }  — ex: 5 para 5%, -10 para desconto de 10%
 */
import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { reajustarMensalidadesEmLote } from '@/lib/services/asaas-sync'
import type { SessionUser } from '@/types'

// Aumenta o timeout para suportar escritórios com muitos clientes (Asaas é sequencial)
export const maxDuration = 120  // 2 minutos

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as SessionUser
  if (user.tipo !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 })
  }

  let body: { percentual: number; clienteIds?: string[] }
  try {
    body = await req.json() as { percentual: number; clienteIds?: string[] }
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const percentual = Number(body.percentual)
  if (isNaN(percentual) || percentual === 0) {
    return NextResponse.json({ error: 'Percentual inválido. Informe um número diferente de zero.' }, { status: 400 })
  }
  if (percentual < -99 || percentual > 500) {
    return NextResponse.json({ error: 'Percentual fora do intervalo permitido (-99% a 500%).' }, { status: 400 })
  }

  // clienteIds opcional — quando presente, processa apenas esses IDs (retry de erros)
  const clienteIds = Array.isArray(body.clienteIds) && body.clienteIds.length > 0
    ? body.clienteIds
    : undefined

  try {
    const resultado = await reajustarMensalidadesEmLote(percentual, clienteIds)

    Sentry.captureMessage('[reajuste-mensalidades] Reajuste em lote executado', {
      level: 'info',
      tags:  { module: 'crm-api', operation: 'reajuste-mensalidades-lote' },
      extra: { percentual, ...resultado, operador: user.email },
    })

    return NextResponse.json({ ok: true, percentual, ...resultado })
  } catch (err) {
    console.error('[crm/reajuste-mensalidades] Erro no reajuste em lote:', err)
    Sentry.captureException(err, {
      tags:  { module: 'crm-api', operation: 'reajuste-mensalidades-lote' },
      extra: { percentual, operador: user.email },
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao executar reajuste.' },
      { status: 500 },
    )
  }
}
