/**
 * Stage 1 do pipeline processar-pendentes:
 * Auto-resume de conversas pausadas há mais de 1h sem nova atividade humana.
 *
 * Notifica o CRM via SSE para cada conversa retomada, evitando que
 * operadores fiquem com dados stale no drawer de WhatsApp.
 */

import * as Sentry          from '@sentry/nextjs'
import { prisma }           from '@/lib/prisma'
import { emitWhatsAppRefresh } from '@/lib/event-bus'

export async function retomarPausadas(): Promise<void> {
  const umaHoraAtras = new Date(Date.now() - 60 * 60_000)
  try {
    const conversasPausadasParaResume = await prisma.conversaIA.findMany({
      where:  { canal: 'whatsapp', pausadaEm: { not: null, lt: umaHoraAtras } },
      select: { id: true },
    })
    if (conversasPausadasParaResume.length > 0) {
      await prisma.conversaIA.updateMany({
        where: { id: { in: conversasPausadasParaResume.map(c => c.id) } },
        data:  { pausadaEm: null, pausadoPorId: null },
      })
      // Emite SSE para cada conversa retomada — atualiza o drawer do CRM em tempo real
      for (const c of conversasPausadasParaResume) {
        emitWhatsAppRefresh(c.id)
      }
    }
  } catch (err: unknown) {
    console.error('[processar-pendentes] erro no auto-resume de conversas pausadas:', err)
    Sentry.captureException(err, { tags: { module: 'processar-pendentes', operation: 'auto-resume' } })
  }
}
