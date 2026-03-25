// POST /api/rag/seed
// Re-indexa todos os dados estruturais no RAG:
//   - Dados do escritório (canal: geral)
//   - Planos e preços (canal: geral)
//   - Todos os clientes ativos (canais: crm, portal, whatsapp)
//   - Todos os leads ativos (canal: onboarding)
// Idempotente — pode ser rodado a qualquer momento para resincronizar.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { indexarEscritorio, indexarPlanos, indexarLead, indexarCliente } from '@/lib/rag/ingest'

export async function POST() {
  const session = await auth()
  const tipo = (session?.user as any)?.tipo
  if (!session || tipo !== 'admin') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const resultado = {
    escritorio: false,
    planos: false,
    clientes: 0,
    leads: 0,
    erros: [] as string[],
  }

  // 1. Escritório
  try {
    const escritorio = await prisma.escritorio.findFirst()
    if (escritorio) {
      await indexarEscritorio(escritorio)
      resultado.escritorio = true
    }
  } catch (e) {
    resultado.erros.push(`escritorio: ${String(e)}`)
  }

  // 2. Planos
  try {
    await indexarPlanos()
    resultado.planos = true
  } catch (e) {
    resultado.erros.push(`planos: ${String(e)}`)
  }

  // 3. Clientes ativos
  try {
    const clientes = await prisma.cliente.findMany({
      where: { status: { not: 'cancelado' } },
    })
    for (const c of clientes) {
      try {
        await indexarCliente(c)
        resultado.clientes++
      } catch (e) {
        resultado.erros.push(`cliente:${c.id}: ${String(e)}`)
      }
    }
  } catch (e) {
    resultado.erros.push(`clientes: ${String(e)}`)
  }

  // 4. Leads ativos
  try {
    const leads = await prisma.lead.findMany({
      where: { status: { notIn: ['cancelado', 'expirado', 'assinado'] } },
    })
    for (const l of leads) {
      try {
        await indexarLead(l)
        resultado.leads++
      } catch (e) {
        resultado.erros.push(`lead:${l.id}: ${String(e)}`)
      }
    }
  } catch (e) {
    resultado.erros.push(`leads: ${String(e)}`)
  }

  return NextResponse.json({ ok: true, ...resultado })
}
