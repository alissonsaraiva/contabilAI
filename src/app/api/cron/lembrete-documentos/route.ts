/**
 * POST /api/cron/lembrete-documentos
 *
 * Cron diário — 3 responsabilidades:
 *   1. Lembrete 5 dias antes do vencimento (lembrete5dEnviadoEm = null)
 *   2. Lembrete no dia do vencimento (lembreteDiaEnviadoEm = null)
 *   3. Marca como "vencido" documentos já expirados (status != 'vencido')
 *
 * Setup crontab (VPS — usuário: deploy):
 * 0 9 * * * curl -s -X POST https://dominio/api/cron/lembrete-documentos -H "Authorization: Bearer $CRON_SECRET"
 */
// CRON: 0 9 * * * curl -s -X POST https://dominio/api/cron/lembrete-documentos -H "Authorization: Bearer $CRON_SECRET"

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hc } from '@/lib/healthchecks'
import { notificarDocumentoVencendo } from '@/lib/notificacoes'

export const maxDuration = 120

const DIAS_LEMBRETE = 5
const MAX_BATCH = 50

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  void hc.start(process.env.HC_LEMBRETE_DOCUMENTOS)

  const agora = new Date()
  // Usa UTC para consistência com timestamps do banco (Prisma/Postgres armazena UTC)
  const hoje = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
  const daqui5d = new Date(hoje.getTime() + DIAS_LEMBRETE * 86400000)

  const stats = { lembrete5d: 0, lembreteDia: 0, vencidos: 0, erros: 0 }

  try {
    // ─── 1. Lembrete 5 dias antes ──────────────────────────────────────
    const docsEm5d = await prisma.documento.findMany({
      where: {
        dataVencimento:     { gte: daqui5d, lt: new Date(daqui5d.getTime() + 86400000) },
        lembrete5dEnviadoEm: null,
        visivelPortal:       true,
        deletadoEm:          null,
        status:              { not: 'vencido' },
      },
      select: {
        id: true, nome: true, dataVencimento: true, clienteId: true,
        cliente: { select: { id: true, nome: true } },
      },
      take: MAX_BATCH,
    })

    for (const doc of docsEm5d) {
      if (!doc.clienteId || !doc.cliente) continue
      try {
        await notificarDocumentoVencendo({
          documentoId:    doc.id,
          clienteId:      doc.cliente.id,
          nomeCliente:    doc.cliente.nome,
          nomeDocumento:  doc.nome,
          dataVencimento: doc.dataVencimento!,
          diasRestantes:  DIAS_LEMBRETE,
        })
        await prisma.documento.update({
          where: { id: doc.id },
          data:  { lembrete5dEnviadoEm: agora },
        })
        stats.lembrete5d++
      } catch (err) {
        stats.erros++
        Sentry.captureException(err, {
          tags:  { module: 'cron-lembrete-documentos', operation: 'lembrete-5d' },
          extra: { documentoId: doc.id, clienteId: doc.clienteId },
        })
      }
    }

    // ─── 2. Lembrete no dia do vencimento ──────────────────────────────
    const docsHoje = await prisma.documento.findMany({
      where: {
        dataVencimento:       { gte: hoje, lt: new Date(hoje.getTime() + 86400000) },
        lembreteDiaEnviadoEm: null,
        visivelPortal:        true,
        deletadoEm:           null,
        status:               { not: 'vencido' },
      },
      select: {
        id: true, nome: true, dataVencimento: true, clienteId: true,
        cliente: { select: { id: true, nome: true } },
      },
      take: MAX_BATCH,
    })

    for (const doc of docsHoje) {
      if (!doc.clienteId || !doc.cliente) continue
      try {
        await notificarDocumentoVencendo({
          documentoId:    doc.id,
          clienteId:      doc.cliente.id,
          nomeCliente:    doc.cliente.nome,
          nomeDocumento:  doc.nome,
          dataVencimento: doc.dataVencimento!,
          diasRestantes:  0,
        })
        await prisma.documento.update({
          where: { id: doc.id },
          data:  { lembreteDiaEnviadoEm: agora },
        })
        stats.lembreteDia++
      } catch (err) {
        stats.erros++
        Sentry.captureException(err, {
          tags:  { module: 'cron-lembrete-documentos', operation: 'lembrete-dia' },
          extra: { documentoId: doc.id, clienteId: doc.clienteId },
        })
      }
    }

    // ─── 3. Marcar vencidos ────────────────────────────────────────────
    const { count: vencidos } = await prisma.documento.updateMany({
      where: {
        dataVencimento: { lt: hoje },
        deletadoEm:     null,
        status:         { not: 'vencido' },
      },
      data: { status: 'vencido' },
    })
    stats.vencidos = vencidos

    void hc.ok(process.env.HC_LEMBRETE_DOCUMENTOS)
    return NextResponse.json({ ok: true, ...stats })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    Sentry.captureException(err, {
      tags: { module: 'cron-lembrete-documentos', operation: 'batch' },
    })
    void hc.fail(process.env.HC_LEMBRETE_DOCUMENTOS)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
