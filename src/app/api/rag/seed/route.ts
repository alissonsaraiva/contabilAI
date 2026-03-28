// POST /api/rag/seed
// Re-indexa todos os dados estruturais no RAG:
//   - Dados do escritório (canal: geral)
//   - Planos e preços (canal: geral)
//   - Todos os clientes ativos com sócios (canais: crm, portal, whatsapp)
//   - Todos os leads ativos (canal: onboarding)
//   - Tarefas vinculadas a clientes (canal: crm)
//   - Escalações resolvidas (canal: crm)
// Idempotente — pode ser rodado a qualquer momento para resincronizar.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { indexarEscritorio, indexarPlanos, indexarLead, indexarCliente, indexarTarefa, indexarEscalacao } from '@/lib/rag/ingest'

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
    tarefas: 0,
    escalacoes: 0,
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

  // 3. Clientes ativos (com sócios)
  try {
    const clientes = await prisma.cliente.findMany({
      where: { status: { not: 'cancelado' } },
      include: { empresa: { include: { socios: true } } },
    })
    for (const c of clientes) {
      try {
        await indexarCliente({
          ...c,
          cnpj: c.empresa?.cnpj ?? null,
          razaoSocial: c.empresa?.razaoSocial ?? null,
          nomeFantasia: c.empresa?.nomeFantasia ?? null,
          regime: c.empresa?.regime ?? null,
          socios: c.empresa?.socios ?? [],
        })
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

  // 5. Tarefas vinculadas a clientes (não canceladas)
  try {
    const tarefas = await prisma.tarefa.findMany({
      where: {
        clienteId: { not: null },
        status: { not: 'cancelada' },
      },
    })
    for (const t of tarefas) {
      try {
        await indexarTarefa(t)
        resultado.tarefas++
      } catch (e) {
        resultado.erros.push(`tarefa:${t.id}: ${String(e)}`)
      }
    }
  } catch (e) {
    resultado.erros.push(`tarefas: ${String(e)}`)
  }

  // 6. Escalações resolvidas
  try {
    const escalacoes = await prisma.escalacao.findMany({
      where: { status: 'resolvida' },
    })
    for (const esc of escalacoes) {
      try {
        await indexarEscalacao(esc)
        resultado.escalacoes++
      } catch (e) {
        resultado.erros.push(`escalacao:${esc.id}: ${String(e)}`)
      }
    }
  } catch (e) {
    resultado.erros.push(`escalacoes: ${String(e)}`)
  }

  return NextResponse.json({ ok: true, ...resultado })
}
