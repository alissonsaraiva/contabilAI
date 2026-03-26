import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { ConversaRodape } from '../../_components/conversa-rodape'

export default async function ConversaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const conversa = await prisma.conversaIA.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nome: true } },
      lead:    { select: { id: true, contatoEntrada: true, dadosJson: true } },
      mensagens: { orderBy: { criadaEm: 'asc' } },
    },
  })

  if (!conversa) notFound()

  const nomeExibido =
    conversa.cliente?.nome ??
    ((conversa.lead?.dadosJson as any)?.nomeCompleto as string | undefined) ??
    ((conversa.lead?.dadosJson as any)?.nome as string | undefined) ??
    conversa.lead?.contatoEntrada ??
    conversa.remoteJid?.replace('@s.whatsapp.net', '') ??
    'Desconhecido'

  const destino = conversa.clienteId
    ? { href: `/crm/clientes/${conversa.clienteId}`, label: 'Ver cliente' }
    : conversa.leadId
    ? { href: `/crm/leads/${conversa.leadId}`, label: 'Ver lead' }
    : null

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      {/* Header */}
      <div className="flex items-start gap-4 px-1 pb-4">
        <Link
          href="/crm/atendimentos"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-light tracking-tight text-on-surface">{nomeExibido}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-on-surface-variant/60">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">forum</span>
              {conversa.canal}
            </span>
            {conversa.remoteJid && (
              <span>{conversa.remoteJid.replace('@s.whatsapp.net', '')}</span>
            )}
            <span>Iniciada em {formatDateTime(conversa.criadaEm)}</span>
            {conversa.pausadaEm && (
              <span className="rounded-full bg-orange-status/10 px-2 py-0.5 text-orange-status font-medium">
                Pausada · você está no controle
              </span>
            )}
          </div>
        </div>
        {destino && (
          <Link
            href={destino.href}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-container px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            {destino.label}
          </Link>
        )}
      </div>

      {/* Mensagens */}
      <div className="flex-1 rounded-[14px] border border-outline-variant/15 bg-card p-4 shadow-sm space-y-3 mb-4">
        {conversa.mensagens.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-on-surface-variant/50">Sem mensagens</p>
        ) : (
          conversa.mensagens.map(m => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === 'assistant' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  m.role === 'assistant'
                    ? 'bg-primary/10 text-on-surface rounded-tr-sm'
                    : 'bg-surface-container text-on-surface rounded-tl-sm'
                }`}
              >
                {m.conteudo === '[áudio]' ? (
                  <div className="flex flex-col gap-1.5">
                    <audio
                      controls
                      src={`/api/whatsapp/media/${m.id}`}
                      className="h-9 w-48 rounded-lg"
                    />
                    <p className="text-[10px] text-on-surface-variant/50">Áudio não transcrito</p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.conteudo}</p>
                )}
                <p className={`mt-1 text-[10px] ${m.role === 'assistant' ? 'text-primary/50 text-right' : 'text-on-surface-variant/40'}`}>
                  {formatDateTime(m.criadaEm)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Rodapé fixo — assumir ou digitar */}
      <ConversaRodape
        conversaId={conversa.id}
        canal={conversa.canal}
        pausada={!!conversa.pausadaEm}
      />
    </div>
  )
}
