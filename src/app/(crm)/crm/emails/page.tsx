import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { EmailsGmail } from './_components/emails-gmail'

export default async function EmailsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  function serializarInteracao(i: any) {
    const meta = (i.metadados ?? {}) as Record<string, unknown>
    return {
      id:           i.id,
      tipo:         i.tipo as 'email_recebido' | 'email_enviado',
      titulo:       i.titulo as string | null,
      conteudo:     i.conteudo as string | null,
      criadoEm:     i.criadoEm.toISOString(),
      respondidoEm: (i.respondidoEm as Date | null)?.toISOString() ?? null,
      clienteId:    i.clienteId as string | null,
      leadId:       i.leadId as string | null,
      clienteNome:  (i.cliente?.nome as string | undefined)
        ?? ((i.lead?.dadosJson as any)?.nomeCompleto as string | undefined)
        ?? (i.lead?.contatoEntrada as string | undefined)
        ?? null,
      clienteLink:  i.clienteId
        ? `/crm/clientes/${i.clienteId}`
        : i.leadId ? `/crm/leads/${i.leadId}` : null,
      metadados: {
        de:            (meta.de            as string)  ?? '',
        para:          (meta.para          as string)  ?? '',
        nomeRemetente: (meta.nomeRemetente as string | null) ?? null,
        assunto:       (meta.assunto       as string)  ?? i.titulo ?? '',
        messageId:     (meta.messageId     as string | null) ?? null,
        dataEnvio:     (meta.dataEnvio     as string | null) ?? null,
        anexos:        (meta.anexos        as Array<{ nome: string; url: string; mimeType: string }>) ?? [],
        sugestao:      (meta.sugestao      as string | null) ?? null,
      },
    }
  }

  const include = {
    cliente: { select: { id: true, nome: true } },
    lead:    { select: { id: true, contatoEntrada: true, dadosJson: true } },
  }

  const [recebidos, respondidos, enviados] = await Promise.all([
    prisma.interacao.findMany({
      where:   { tipo: 'email_recebido', respondidoEm: null },
      orderBy: { criadoEm: 'desc' },
      take: 100,
      include,
    }),
    prisma.interacao.findMany({
      where:   { tipo: 'email_recebido', respondidoEm: { not: null } },
      orderBy: { respondidoEm: 'desc' },
      take: 50,
      include,
    }),
    prisma.interacao.findMany({
      where:   { tipo: 'email_enviado' },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      include,
    }),
  ])

  const clientes = await prisma.cliente.findMany({
    where:  { status: { in: ['ativo', 'inadimplente'] } },
    select: { id: true, nome: true, email: true },
    orderBy: { nome: 'asc' },
  })

  return (
    <EmailsGmail
      recebidos={recebidos.map(serializarInteracao)}
      respondidos={respondidos.map(serializarInteracao)}
      enviados={enviados.map(serializarInteracao)}
      clientes={clientes}
    />
  )
}
