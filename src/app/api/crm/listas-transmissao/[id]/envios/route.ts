import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import * as Sentry from '@sentry/nextjs'

type Ctx = { params: Promise<{ id: string }> }

/** GET — Histórico de envios de uma lista */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id: listaId } = await ctx.params

  try {
    const envios = await prisma.envioTransmissao.findMany({
      where: { listaId },
      orderBy: { criadoEm: 'desc' },
      take: 20,
      include: {
        operador: { select: { id: true, nome: true } },
        destinatarios: {
          select: { id: true, clienteId: true, socioId: true, remoteJid: true, status: true, erroEnvio: true, enviadoEm: true },
        },
      },
    })

    return NextResponse.json({
      envios: envios.map(e => ({
        id: e.id,
        conteudo: e.conteudo,
        mediaUrl: e.mediaUrl,
        mediaType: e.mediaType,
        mediaFileName: e.mediaFileName,
        status: e.status,
        totalMembros: e.totalMembros,
        totalEnviados: e.totalEnviados,
        totalFalhas: e.totalFalhas,
        operador: e.operador,
        criadoEm: e.criadoEm.toISOString(),
        destinatarios: e.destinatarios,
      })),
    })
  } catch (err) {
    console.error('[listas-transmissao] erro ao listar envios:', err)
    Sentry.captureException(err, { tags: { module: 'broadcast', operation: 'listar-envios' }, extra: { listaId } })
    return NextResponse.json({ error: 'Erro ao listar envios' }, { status: 500 })
  }
}
