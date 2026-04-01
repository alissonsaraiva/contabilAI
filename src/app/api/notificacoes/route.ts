import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export type Notificacao = {
  id: string
  tipo: 'escalacao' | 'ia_offline' | 'agente_falhou' | 'documento_enviado' | 'cliente_inadimplente' | 'documento_falhou'
  titulo: string
  descricao?: string
  href: string
  criadaEm: string // ISO string — serializável via JSON
  podeDescartar: boolean // false para escalações (são atendimentos reais pendentes)
}

// Tipos de notificação visíveis por papel
// admin      → tudo
// contador   → escalações + eventos de cliente
// assistente → escalações + eventos de cliente
const TIPOS_POR_PAPEL: Record<string, string[] | undefined> = {
  admin:      undefined,                // sem filtro — vê tudo
  contador:   ['escalacao', 'documento_enviado', 'cliente_inadimplente', 'documento_falhou'],
  assistente: ['escalacao', 'documento_enviado', 'cliente_inadimplente', 'documento_falhou'],
}

export async function GET() {
  const session = await auth()
  const usuarioId = (session?.user as any)?.id
  const tipo = (session?.user as any)?.tipo as string | undefined

  const tiposPermitidos = tipo ? TIPOS_POR_PAPEL[tipo] : null
  // null = papel desconhecido/não autorizado; undefined = sem filtro (admin)
  if (!session || tiposPermitidos === null) {
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
          where: {
            usuarioId,
            lida: false,
            // segurança extra: filtra na leitura além da criação
            ...(tiposPermitidos ? { tipo: { in: tiposPermitidos } } : {}),
          },
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
    tipo: 'escalacao' as const,
    titulo: `Atendimento pendente · ${CANAL_LABEL[e.canal] ?? e.canal}`,
    descricao: e.motivoIA ?? e.ultimaMensagem?.slice(0, 80) ?? undefined,
    href: e.conversaIAId
      ? `/crm/atendimentos/conversa/${e.conversaIAId}`
      : `/crm/atendimentos`,
    criadaEm: e.criadoEm.toISOString(),
    podeDescartar: false, // atendimento real pendente — só some quando resolvido
  }))

  const deBanco: Notificacao[] = notificacoesDB.map(n => ({
    id: n.id,
    tipo: n.tipo as Notificacao['tipo'],
    titulo: n.titulo,
    descricao: n.mensagem ?? undefined,
    href: n.url ?? '/crm/configuracoes/ia/saude',
    criadaEm: n.criadoEm.toISOString(),
    podeDescartar: true,
  }))

  // Mescla e ordena por data decrescente (mais recente primeiro)
  const todas = [...deEscalacoes, ...deBanco].sort(
    (a, b) => new Date(b.criadaEm).getTime() - new Date(a.criadaEm).getTime(),
  )

  return NextResponse.json(todas)
}

// Limpar todas as notificações do banco (lida = true) para o usuário atual
export async function DELETE() {
  const session = await auth()
  const usuarioId = (session?.user as any)?.id
  if (!session || !usuarioId) return NextResponse.json({ ok: false }, { status: 401 })

  await prisma.notificacao.updateMany({
    where: { usuarioId, lida: false },
    data: { lida: true },
  })

  return NextResponse.json({ ok: true })
}
