import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { ConversaRodape } from '../../_components/conversa-rodape'
import { ConversaRefresher } from './conversa-refresher'

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
      {/* Atualiza em tempo real quando cliente envia mensagem durante conversa pausada */}
      <ConversaRefresher conversaId={id} />
      {/* Header */}
      <div className="flex items-start gap-4 px-1 pb-4">
        <Link
          href="/crm/atendimentos"
          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-on-surface-variant/60 hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-light tracking-tight text-on-surface">{nomeExibido}</h1>
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
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-container px-3 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors"
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
                    <audio controls src={`/api/whatsapp/media/${m.id}`} className="h-9 w-full max-w-[12rem] rounded-lg" />
                    <p className="text-[10px] text-on-surface-variant/50">Áudio não transcrito</p>
                  </div>
                ) : m.whatsappMsgData && !m.mediaUrl && m.conteudo === '[image]' ? (
                  <div className="flex flex-col gap-1.5">
                    <img src={`/api/whatsapp/media/${m.id}`} alt="imagem" className="max-w-full rounded-xl object-cover" />
                  </div>
                ) : m.whatsappMsgData && !m.mediaUrl && m.conteudo.startsWith('[') && m.conteudo.endsWith(']') ? (
                  <div className="flex flex-col gap-1.5">
                    <a href={`/api/whatsapp/media/${m.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 hover:bg-surface-container transition-colors">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">attach_file</span>
                      <span className="text-[12px] truncate max-w-[9rem] sm:max-w-[200px]">
                        {m.conteudo.startsWith('[') ? 'Arquivo do cliente' : m.conteudo}
                      </span>
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/60 shrink-0">download</span>
                    </a>
                  </div>
                ) : m.mediaUrl && m.mediaType === 'image' ? (
                  <div className="flex flex-col gap-1.5">
                    <img src={m.mediaUrl} alt={m.mediaFileName ?? 'imagem'} className="max-w-full rounded-xl object-cover" />
                    {m.conteudo && <p className="whitespace-pre-wrap text-[13px]">{m.conteudo}</p>}
                  </div>
                ) : m.mediaUrl ? (
                  <div className="flex flex-col gap-1.5">
                    <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low px-3 py-2 hover:bg-surface-container transition-colors">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">attach_file</span>
                      <span className="text-[12px] truncate max-w-[9rem] sm:max-w-[200px]">{m.mediaFileName ?? 'Arquivo'}</span>
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant/60 shrink-0">download</span>
                    </a>
                    {m.conteudo && <p className="whitespace-pre-wrap text-[13px]">{m.conteudo}</p>}
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
        entidadeTipo={conversa.clienteId ? 'cliente' : conversa.leadId ? 'lead' : undefined}
        entidadeId={conversa.clienteId ?? conversa.leadId ?? undefined}
      />
    </div>
  )
}
