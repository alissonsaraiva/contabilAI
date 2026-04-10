import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'

export async function POST(req: Request) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  try {
    subscription = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const { endpoint, keys } = subscription
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Subscription incompleta' }, { status: 400 })
  }

  // Resolve clienteId — sócios usam o clienteId do titular da empresa (via ClienteEmpresa)
  const clienteId = await resolveClienteId(user)
  if (!clienteId) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  // Upsert por endpoint — atualiza chaves se o mesmo device re-subscrever
  await prisma.pushSubscription.upsert({
    where:  { endpoint },
    create: { clienteId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { clienteId, p256dh: keys.p256dh, auth: keys.auth },
  })

  return NextResponse.json({ ok: true })
}
