import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getNomeFromDadosJson } from '@/lib/schemas/lead-dados-json'

export type EmailInboxItem = {
  id: string
  titulo: string | null        // assunto
  conteudo: string | null      // corpo do email
  criadoEm: string             // ISO
  clienteId: string | null
  leadId: string | null
  clienteNome: string | null
  metadados: {
    de: string
    nomeRemetente: string | null
    assunto: string
    messageId: string | null
    dataEnvio: string | null
    anexos: Array<{ nome: string; url: string; mimeType: string }>
    documentosId: string[]
    sugestao: string | null
  }
}

/** GET /api/email/inbox — lista emails recebidos não respondidos */
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, Number(searchParams.get('page')  ?? 1))
  const limit = Math.min(50, Number(searchParams.get('limit') ?? 20))
  const skip  = (page - 1) * limit

  const where = {
    tipo:        'email_recebido',
    respondidoEm: null,
  }

  const [itens, total] = await Promise.all([
    prisma.interacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      skip,
      take: limit,
      include: {
        cliente: { select: { id: true, nome: true } },
        lead:    { select: { id: true, contatoEntrada: true, dadosJson: true } },
      },
    }),
    prisma.interacao.count({ where }),
  ])

  const result: EmailInboxItem[] = itens.map(i => {
    const meta = (i.metadados ?? {}) as Record<string, unknown>
    return {
      id:           i.id,
      titulo:       i.titulo,
      conteudo:     i.conteudo,
      criadoEm:     i.criadoEm.toISOString(),
      clienteId:    i.clienteId,
      leadId:       i.leadId,
      clienteNome:  i.cliente?.nome
        ?? getNomeFromDadosJson(i.lead?.dadosJson)
        ?? i.lead?.contatoEntrada
        ?? null,
      metadados: {
        de:            (meta.de            as string)  ?? '',
        nomeRemetente: (meta.nomeRemetente as string | null) ?? null,
        assunto:       (meta.assunto       as string)  ?? i.titulo ?? '',
        messageId:     (meta.messageId     as string | null) ?? null,
        dataEnvio:     (meta.dataEnvio     as string | null) ?? null,
        anexos:        (meta.anexos        as EmailInboxItem['metadados']['anexos']) ?? [],
        documentosId:  (meta.documentosId  as string[]) ?? [],
        sugestao:      (meta.sugestao      as string | null) ?? null,
      },
    }
  })

  return NextResponse.json({ itens: result, total, page, pages: Math.ceil(total / limit) })
}
