import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { prisma }       from '@/lib/prisma'

/**
 * GET /api/email/inbox/count?desde=<ISO>
 * Retorna a contagem de emails_recebidos não respondidos chegados após `desde`.
 * Usado pelo polling da tela de emails para detectar novidades sem recarregar a página.
 */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desdeRaw = searchParams.get('desde')
  const desde    = desdeRaw ? new Date(desdeRaw) : new Date(0)

  const count = await prisma.interacao.count({
    where: {
      tipo:         'email_recebido',
      respondidoEm: null,
      criadoEm:     { gt: desde },
    },
  })

  return NextResponse.json({ count })
}
