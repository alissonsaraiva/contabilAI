/**
 * GET /api/portal/session
 *
 * Retorna o sessionId canônico do portal para o usuário autenticado.
 * O sessionId fica armazenado no DB (Cliente.portalSessionId ou Socio.portalSessionId),
 * garantindo que o mesmo histórico de chat seja acessível em qualquer dispositivo/contexto.
 *
 * Na primeira chamada (campo null no banco):
 *   1. Busca conversa existente pelo clienteId para migrar histórico antigo
 *   2. Se não encontrar, gera novo UUID
 *   3. Salva no registro do usuário (updateMany com condição null para evitar race condition)
 *   4. Re-lê o valor salvo e retorna (garante consistência mesmo com duas chamadas simultâneas)
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth-portal'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const isSocio  = user.tipo === 'socio'
  const userId   = user.id as string

  // ── 1. Retorna imediatamente se já existe sessionId canônico ────────────────
  if (isSocio) {
    const socio = await prisma.socio.findUnique({
      where:  { id: userId },
      select: { portalSessionId: true },
    })
    if (socio?.portalSessionId) {
      return NextResponse.json({ sessionId: socio.portalSessionId })
    }
  } else {
    const cliente = await prisma.cliente.findUnique({
      where:  { id: userId },
      select: { portalSessionId: true },
    })
    if (cliente?.portalSessionId) {
      return NextResponse.json({ sessionId: cliente.portalSessionId })
    }
  }

  // ── 2. Primeira vez — resolve o clienteId para buscar conversa existente ────
  const clienteId = isSocio
    ? (await prisma.cliente.findUnique({
        where:  { empresaId: user.empresaId as string },
        select: { id: true },
      }))?.id
    : userId

  // ── 3. Tenta migrar sessionId de conversa existente (preserva histórico) ────
  let canonicalSessionId: string

  const conversaExistente = clienteId
    ? await prisma.conversaIA.findFirst({
        where:   { clienteId, canal: 'portal', sessionId: { not: null } },
        orderBy: { atualizadaEm: 'desc' },
        select:  { sessionId: true },
      })
    : null

  canonicalSessionId = conversaExistente?.sessionId ?? crypto.randomUUID()

  // ── 4. Salva no registro — updateMany com condição null evita race condition ─
  if (isSocio) {
    await prisma.socio.updateMany({
      where: { id: userId, portalSessionId: null },
      data:  { portalSessionId: canonicalSessionId },
    })
    const refreshed = await prisma.socio.findUnique({
      where:  { id: userId },
      select: { portalSessionId: true },
    })
    return NextResponse.json({ sessionId: refreshed!.portalSessionId })
  } else {
    await prisma.cliente.updateMany({
      where: { id: userId, portalSessionId: null },
      data:  { portalSessionId: canonicalSessionId },
    })
    const refreshed = await prisma.cliente.findUnique({
      where:  { id: userId },
      select: { portalSessionId: true },
    })
    return NextResponse.json({ sessionId: refreshed!.portalSessionId })
  }
}
