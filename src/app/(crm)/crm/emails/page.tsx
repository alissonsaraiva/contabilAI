import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { EmailsClient } from './_components/emails-client'

export default async function EmailsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const [pendentes, resolvidos, total] = await Promise.all([
    prisma.interacao.findMany({
      where:   { tipo: 'email_recebido', respondidoEm: null },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      include: {
        cliente: { select: { id: true, nome: true } },
        lead:    { select: { id: true, contatoEntrada: true, dadosJson: true } },
      },
    }),
    prisma.interacao.findMany({
      where:   { tipo: 'email_recebido', respondidoEm: { not: null } },
      orderBy: { respondidoEm: 'desc' },
      take: 20,
      include: {
        cliente: { select: { id: true, nome: true } },
        lead:    { select: { id: true, contatoEntrada: true, dadosJson: true } },
      },
    }),
    prisma.interacao.count({ where: { tipo: 'email_recebido', respondidoEm: null } }),
  ])

  // Serializa para client component
  function serializarEmail(i: (typeof pendentes)[number]) {
    const meta = (i.metadados ?? {}) as Record<string, unknown>
    return {
      id:          i.id,
      titulo:      i.titulo,
      conteudo:    i.conteudo,
      criadoEm:    i.criadoEm.toISOString(),
      respondidoEm: (i as any).respondidoEm?.toISOString() ?? null,
      clienteId:   i.clienteId,
      leadId:      i.leadId,
      clienteNome: i.cliente?.nome
        ?? ((i.lead?.dadosJson as any)?.nomeCompleto as string | undefined)
        ?? i.lead?.contatoEntrada
        ?? null,
      clienteLink: i.clienteId ? `/crm/clientes/${i.clienteId}` : i.leadId ? `/crm/leads/${i.leadId}` : null,
      metadados: {
        de:            (meta.de            as string)  ?? '',
        nomeRemetente: (meta.nomeRemetente as string | null) ?? null,
        assunto:       (meta.assunto       as string)  ?? i.titulo ?? '',
        messageId:     (meta.messageId     as string | null) ?? null,
        dataEnvio:     (meta.dataEnvio     as string | null) ?? null,
        anexos:        (meta.anexos        as Array<{ nome: string; url: string; mimeType: string }>) ?? [],
        documentosId:  (meta.documentosId  as string[]) ?? [],
        sugestao:      (meta.sugestao      as string | null) ?? null,
      },
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-on-surface">E-mails</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Caixa de entrada do escritório
          </p>
        </div>
        {total > 0 && (
          <span className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-[13px] font-bold text-primary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            {total} aguardando resposta
          </span>
        )}
      </div>

      <EmailsClient
        pendentes={pendentes.map(serializarEmail)}
        resolvidos={resolvidos.map(serializarEmail)}
      />
    </div>
  )
}
