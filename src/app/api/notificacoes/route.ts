import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export type Notificacao = {
  id: string
  tipo: 'escalacao' | 'ia_offline' | 'agente_falhou' | 'entrega_falhou'
  titulo: string
  descricao?: string
  href: string
  criadaEm: string // ISO string — serializável via JSON
}

export async function GET() {
  const session = await auth()
  const usuarioId = (session?.user as any)?.id
  const tipo = (session?.user as any)?.tipo
  if (!session || (tipo !== 'admin' && tipo !== 'contador')) {
    return NextResponse.json([] as Notificacao[])
  }

  const [escalacoes, notificacoesDB] = await Promise.all([
    prisma.escalacao.findMany({
      where: { status: 'pendente' },
      orderBy: { criadoEm: 'desc' },
      take: 20,
      select: {
        id: true,
        canal: true,
        motivoIA: true,
        ultimaMensagem: true,
        criadoEm: true,
        conversaIAId: true,
      },
    }),
    usuarioId
      ? prisma.notificacao.findMany({
          where: { usuarioId, lida: false },
          orderBy: { criadoEm: 'desc' },
          take: 20,
          select: { id: true, tipo: true, titulo: true, mensagem: true, url: true, criadoEm: true },
        })
      : [],
  ])

  const CANAL_LABEL: Record<string, string> = {
    whatsapp:   'WhatsApp',
    onboarding: 'Site',
    portal:     'Portal',
    crm:        'CRM',
  }

  const deEscalacoes: Notificacao[] = escalacoes.map(e => ({
    id: e.id,
    tipo: 'escalacao',
    titulo: `Atendimento pendente · ${CANAL_LABEL[e.canal] ?? e.canal}`,
    descricao: e.motivoIA ?? e.ultimaMensagem?.slice(0, 80) ?? undefined,
    href: e.conversaIAId
      ? `/crm/atendimentos/conversa/${e.conversaIAId}`
      : `/crm/atendimentos`,
    criadaEm: e.criadoEm.toISOString(),
  }))

  const deBanco: Notificacao[] = notificacoesDB.map(n => ({
    id: n.id,
    tipo: n.tipo as Notificacao['tipo'],
    titulo: n.titulo,
    descricao: n.mensagem ?? undefined,
    href: n.url ?? '/crm/configuracoes/ia/saude',
    criadaEm: n.criadoEm.toISOString(),
  }))

  // Mescla e ordena por data decrescente (mais recente primeiro)
  const todas = [...deEscalacoes, ...deBanco].sort(
    (a, b) => new Date(b.criadaEm).getTime() - new Date(a.criadaEm).getTime(),
  )

  return NextResponse.json(todas)
}
