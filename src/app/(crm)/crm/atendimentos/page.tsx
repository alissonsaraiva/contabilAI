import { prisma } from '@/lib/prisma'
import { AtendimentosWeb, type ConversaWebItem, type EscalacaoWebItem } from '@/components/crm/atendimentos-web'

export default async function AtendimentosPage() {
  const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [todasConversas, pendentes, emAtendimento, emailsPendentes] = await Promise.all([
    prisma.conversaIA.findMany({
      where: {
        canal:        { not: 'crm' },
        atualizadaEm: { gte: limite24h },
      },
      orderBy: { atualizadaEm: 'desc' },
      take: 100,
      include: {
        cliente:   { select: { id: true, nome: true } },
        lead:      { select: { id: true, contatoEntrada: true, dadosJson: true } },
        mensagens: { orderBy: { criadaEm: 'desc' }, take: 1, select: { conteudo: true, role: true } },
      },
    }),
    prisma.escalacao.findMany({
      where:   { status: 'pendente' },
      orderBy: { criadoEm: 'asc' },
      take: 50,
      select: { id: true, canal: true, ultimaMensagem: true, motivoIA: true, criadoEm: true, status: true },
    }),
    prisma.escalacao.findMany({
      where:   { status: 'em_atendimento' },
      orderBy: { atualizadoEm: 'desc' },
      take: 50,
      select: { id: true, canal: true, ultimaMensagem: true, motivoIA: true, criadoEm: true, status: true },
    }),
    prisma.interacao.count({ where: { tipo: 'email_recebido', respondidoEm: null } }).catch(() => 0),
  ])

  // Deduplica: por cliente+canal, lead+canal ou sócio+canal — permite que o mesmo cliente
  // apareça com WhatsApp e Portal simultaneamente (cada canal é tratado como conversa distinta)
  const seenCliente = new Set<string>()
  const seenLead    = new Set<string>()
  const seenSocio   = new Set<string>()
  const conversas   = todasConversas.filter(c => {
    if (c.socioId) {
      const key = `${c.socioId}:${c.canal}`
      if (seenSocio.has(key)) return false
      seenSocio.add(key); return true
    }
    if (c.clienteId) {
      const key = `${c.clienteId}:${c.canal}`
      if (seenCliente.has(key)) return false
      seenCliente.add(key); return true
    }
    if (c.leadId) {
      const key = `${c.leadId}:${c.canal}`
      if (seenLead.has(key)) return false
      seenLead.add(key); return true
    }
    return true
  })

  // Separa em 3 grupos
  const aguardandoResposta  = conversas.filter(c => c.pausadaEm && c.ultimaMensagemEm && c.ultimaMensagemEm > c.pausadaEm)
  const emAtendimentoHumano = conversas.filter(c => c.pausadaEm && (!c.ultimaMensagemEm || c.ultimaMensagemEm <= c.pausadaEm))
  const ativasIA            = conversas.filter(c => !c.pausadaEm)

  // Serializa datas para os client components
  const toGrid = (lista: typeof todasConversas): ConversaWebItem[] =>
    lista.map(c => ({
      id:               c.id,
      canal:            c.canal,
      pausadaEm:        c.pausadaEm?.toISOString() ?? null,
      ultimaMensagemEm: c.ultimaMensagemEm?.toISOString() ?? null,
      atualizadaEm:     c.atualizadaEm.toISOString(),
      remoteJid:        c.remoteJid,
      socioId:          c.socioId ?? null,
      cliente:          c.cliente,
      lead:             c.lead,
      mensagens:        c.mensagens,
    }))

  const toEscalacao = (lista: typeof pendentes): EscalacaoWebItem[] =>
    lista.map(e => ({
      id:             e.id,
      canal:          e.canal,
      ultimaMensagem: e.ultimaMensagem ?? '',
      motivoIA:       e.motivoIA ?? null,
      criadoEm:       e.criadoEm.toISOString(),
      status:         e.status,
    }))

  return (
    // Cancela o padding do <main> para o layout ocupar toda a área disponível
    <div className="-m-4 md:-m-6 lg:-m-8 h-full overflow-hidden">
      <AtendimentosWeb
        aguardandoResposta={toGrid(aguardandoResposta)}
        emAtendimentoHumano={toGrid(emAtendimentoHumano)}
        ativasIA={toGrid(ativasIA)}
        escalacoesPendentes={toEscalacao(pendentes)}
        escalacaoEmAtendimento={toEscalacao(emAtendimento)}
        emailsPendentes={emailsPendentes}
      />
    </div>
  )
}
