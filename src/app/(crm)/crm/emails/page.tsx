import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getEscritorioConfig } from '@/lib/escritorio'
import { EmailsGmail } from './_components/emails-gmail'
import { getNomeFromDadosJson } from '@/lib/schemas/lead-dados-json'

export type MensagemThread = {
  id:           string
  tipo:         'email_recebido' | 'email_enviado'
  conteudo:     string | null
  criadoEm:     string
  respondidoEm: string | null
  de:           string
  para:         string
  nomeRemetente: string | null
  assunto:      string
  messageId:    string | null
  anexos:       Array<{ nome: string; url: string; mimeType: string }>
  anexosRejeitados: string[]
  sugestao:     string | null
  origem:       string | null
}

export type ThreadItem = {
  threadId:        string          // Root messageId ou interacao.id como fallback
  assunto:         string
  clienteId:       string | null
  leadId:          string | null
  clienteNome:     string | null
  clienteLink:     string | null
  temNaoRespondido: boolean        // tem email_recebido sem respondidoEm
  ultimaData:      string
  mensagens:       MensagemThread[]
  /** Operador responsável por responder esta thread (null = não atribuído) */
  atribuidaPara:   { id: string; nome: string } | null
  /** ID da primeira interação da thread — usado como referência para atribuir */
  interacaoRaizId: string
}

type Props = { searchParams: Promise<{ dias?: string }> }

export default async function EmailsPage({ searchParams }: Props) {
  const session = await auth()
  if (!session) redirect('/login')

  const sp       = await searchParams
  const diasRaw  = parseInt(sp.dias ?? '90')
  const diasFiltro = [90, 180, 365].includes(diasRaw) ? diasRaw : 90
  const dataLimite = new Date(Date.now() - diasFiltro * 24 * 60 * 60 * 1000)

  const escritorio = await getEscritorioConfig()

  const include = {
    cliente:      { select: { id: true, nome: true } },
    lead:         { select: { id: true, contatoEntrada: true, dadosJson: true } },
    atribuidaPara: { select: { id: true, nome: true } },
  }

  const whereRecebidos = { tipo: 'email_recebido' as const, deletadoEm: null, criadoEm: { gte: dataLimite } }
  const whereEnviados  = { tipo: 'email_enviado'  as const, deletadoEm: null, criadoEm: { gte: dataLimite } }

  // Busca emails do período selecionado com suporte a thread
  const [todosRecebidos, todosEnviados, totalRecebidos] = await Promise.all([
    prisma.interacao.findMany({
      where:   whereRecebidos,
      orderBy: { criadoEm: 'asc' },
      include,
    }),
    prisma.interacao.findMany({
      where:   whereEnviados,
      orderBy: { criadoEm: 'asc' },
      include,
    }),
    prisma.interacao.count({ where: whereRecebidos }),
  ])

  const clientes = await prisma.cliente.findMany({
    where:  { status: { in: ['ativo', 'inadimplente'] } },
    select: { id: true, nome: true, email: true },
    orderBy: { nome: 'asc' },
  })

  function nomePessoa(i: any): string | null {
    return (i.cliente?.nome as string | undefined)
      ?? getNomeFromDadosJson(i.lead?.dadosJson)
      ?? (i.lead?.contatoEntrada as string | undefined)
      ?? null
  }

  function serializarMensagem(i: any): MensagemThread {
    const meta = (i.metadados ?? {}) as Record<string, unknown>
    return {
      id:               i.id,
      tipo:             i.tipo as 'email_recebido' | 'email_enviado',
      conteudo:         i.conteudo as string | null,
      criadoEm:         i.criadoEm.toISOString(),
      respondidoEm:     (i.respondidoEm as Date | null)?.toISOString() ?? null,
      de:               (meta.de    as string) ?? '',
      para:             (meta.para  as string) ?? '',
      nomeRemetente:    (meta.nomeRemetente as string | null) ?? null,
      assunto:          (meta.assunto as string) ?? i.titulo ?? '',
      messageId:        i.emailMessageId ?? (meta.messageId as string | null) ?? null,
      anexos:           (meta.anexos           as Array<{ nome: string; url: string; mimeType: string }>) ?? [],
      anexosRejeitados: (meta.anexosRejeitados as string[] | undefined) ?? [],
      sugestao:         (meta.sugestao         as string | null) ?? null,
      origem:           i.origem as string | null,
    }
  }

  // ── Agrupar por threadId ────────────────────────────────────────────────────
  const threadMap = new Map<string, {
    interacoes: any[]
    clienteId:  string | null
    leadId:     string | null
    clienteNome: string | null
  }>()

  function getThreadKey(i: any): string {
    // Usa emailThreadId se disponível, senão o próprio emailMessageId, senão o id da interacao
    return i.emailThreadId ?? i.emailMessageId ?? i.id
  }

  for (const i of [...todosRecebidos, ...todosEnviados]) {
    const key = getThreadKey(i)
    if (!threadMap.has(key)) {
      threadMap.set(key, {
        interacoes:  [],
        clienteId:   i.clienteId,
        leadId:      i.leadId,
        clienteNome: nomePessoa(i),
      })
    }
    threadMap.get(key)!.interacoes.push(i)
  }

  function buildThread(threadId: string, data: { interacoes: any[]; clienteId: string | null; leadId: string | null; clienteNome: string | null }): ThreadItem {
    // Ordena por data crescente dentro da thread
    const sorted = [...data.interacoes].sort(
      (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime()
    )
    const ultimo   = sorted[sorted.length - 1]
    const assunto  = (sorted.find(i => i.tipo === 'email_recebido') ?? sorted[0])?.titulo ?? '(sem assunto)'
    const temNaoRespondido = sorted.some(i => i.tipo === 'email_recebido' && !i.respondidoEm)
    const clienteLink = data.clienteId
      ? `/crm/clientes/${data.clienteId}`
      : data.leadId ? `/crm/leads/${data.leadId}` : null

    // Atribuição: pega do primeiro email da thread que tiver (todos devem ser iguais)
    const comAtribuicao = sorted.find((i: any) => i.atribuidaPara)
    const atribuidaPara = (comAtribuicao?.atribuidaPara as { id: string; nome: string } | null) ?? null

    return {
      threadId,
      assunto:          assunto as string,
      clienteId:        data.clienteId,
      leadId:           data.leadId,
      clienteNome:      data.clienteNome,
      clienteLink,
      temNaoRespondido,
      ultimaData:       ultimo.criadoEm.toISOString(),
      mensagens:        sorted.map(serializarMensagem),
      atribuidaPara,
      interacaoRaizId:  (sorted[0] as any).id as string,
    }
  }

  const todasThreads = Array.from(threadMap.entries())
    .map(([id, data]) => buildThread(id, data))
    .sort((a, b) => new Date(b.ultimaData).getTime() - new Date(a.ultimaData).getTime())

  // ── Separar por aba ─────────────────────────────────────────────────────────
  //   Entrada:  threads com pelo menos 1 email_recebido sem respondidoEm
  //   Tratados: threads onde todos email_recebido têm respondidoEm (ou só têm enviados de resposta)
  //   Enviados: threads que SÓ têm email_enviado (emails proativos — sem recebidos)
  const threadsEntrada  = todasThreads.filter(t => t.temNaoRespondido)
  const threadsTratados = todasThreads.filter(t => {
    const temRecebido = t.mensagens.some(m => m.tipo === 'email_recebido')
    return temRecebido && !t.temNaoRespondido
  })
  const threadsEnviados = todasThreads.filter(t =>
    t.mensagens.every(m => m.tipo === 'email_enviado')
  )

  return (
    <EmailsGmail
      threadsEntrada={threadsEntrada}
      threadsTratados={threadsTratados}
      threadsEnviados={threadsEnviados}
      clientes={clientes}
      operadorNome={session.user?.name ?? 'Equipe'}
      escritorioNome={escritorio.nomeFantasia ?? escritorio.nome}
      diasFiltro={diasFiltro}
      totalRecebidos={totalRecebidos}
      currentUserId={session?.user?.id ?? null}
    />
  )
}
