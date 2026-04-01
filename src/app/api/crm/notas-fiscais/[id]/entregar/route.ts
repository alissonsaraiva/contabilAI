/**
 * POST /api/crm/notas-fiscais/[id]/entregar — envia PDF ao cliente
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { entregarNotaCliente } from '@/lib/services/notas-fiscais'
import { logger } from '@/lib/logger'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { canal?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const canal = (body.canal ?? 'whatsapp') as 'whatsapp' | 'email' | 'portal'
  if (!['whatsapp', 'email', 'portal'].includes(canal)) {
    return NextResponse.json({ error: 'Canal inválido. Use: whatsapp, email ou portal' }, { status: 400 })
  }

  try {
    await entregarNotaCliente(id, canal)
    return NextResponse.json({ sucesso: true })
  } catch (err) {
    logger.error('api-crm-entregar-nfse', { id, canal, err })
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
