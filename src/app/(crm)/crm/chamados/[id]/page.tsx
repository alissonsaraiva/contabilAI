import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'
import { Card } from '@/components/ui/card'
import { ChamadoResponderForm } from '@/components/crm/chamado-responder-form'

const STATUS_CHAMADO: Record<string, { label: string; color: string }> = {
  aberta: { label: 'Aberta', color: 'text-blue-600 bg-blue-500/10' },
  em_andamento: { label: 'Em andamento', color: 'text-primary bg-primary/10' },
  aguardando_cliente: { label: 'Aguardando cliente', color: 'text-yellow-600 bg-yellow-500/10' },
  resolvida: { label: 'Resolvida', color: 'text-green-status bg-green-status/10' },
  cancelada: { label: 'Cancelada', color: 'text-on-surface-variant/50 bg-surface-container' },
}

const TIPO_CHAMADO: Record<string, string> = {
  duvida: 'Dúvida', solicitacao: 'Solicitação', reclamacao: 'Reclamação', documento: 'Documento', emissao_documento: 'Emissão de documento', outros: 'Outros',
}

type Props = { params: Promise<{ id: string }> }

export default async function CrmChamadoDetailPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/crm/login')

  const { id } = await params
  const ordem = await prisma.chamado.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nome: true, email: true, telefone: true, whatsapp: true } },
      empresa: {
        select: {
          razaoSocial: true, nomeFantasia: true,
          socios: { select: { id: true, nome: true, whatsapp: true, telefone: true } },
        },
      },
      notas: { orderBy: { criadoEm: 'asc' } },
    },
  })

  if (!ordem) notFound()

  // Sócios com algum contato WhatsApp
  const sociosContato = (ordem.empresa?.socios ?? [])
    .filter(s => s.whatsapp || s.telefone)
    .map(s => ({ id: s.id, nome: s.nome, telefone: (s.whatsapp || s.telefone)! }))

  const s = STATUS_CHAMADO[ordem.status] ?? STATUS_CHAMADO.aberta
  const nomeEmpresa = ordem.empresa?.razaoSocial ?? ordem.empresa?.nomeFantasia

  return (
    <div className="space-y-8 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <BackButton className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container">
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </BackButton>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface truncate">{ordem.titulo}</h1>
            <span className={`rounded-[4px] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest border border-current/10 ${s.color}`}>
              {s.label}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] font-medium text-on-surface-variant/70">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">confirmation_number</span>
              #{id.slice(-8)}
            </span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] shrink-0 fill-current">circle</span>
              {TIPO_CHAMADO[ordem.tipo] ?? ordem.tipo}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Main */}
        <div className="md:col-span-2 space-y-6">
          {/* Main */}
          <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm transition-colors hover:border-outline-variant/40">
            <div className="flex items-center gap-2.5 px-6 pb-2 pt-6 border-b border-outline-variant/5">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50">person</span>
              <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest text-on-surface-variant">Solicitação do cliente</h2>
            </div>
            <div className="p-6 pt-4">
              <p className="text-[14px] text-on-surface leading-relaxed whitespace-pre-wrap">{ordem.descricao}</p>
              <p className="mt-4 text-[11px] font-medium text-on-surface-variant/50">
                {new Date(ordem.criadoEm).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Resposta existente */}
          {ordem.resposta && (
            <div className="overflow-hidden rounded-xl border border-primary/20 bg-primary/5 shadow-sm transition-colors hover:border-primary/40">
              <div className="flex items-center gap-2.5 px-6 pb-2 pt-6 border-b border-primary/10">
                <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
                <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest text-primary">Resposta do escritório</h2>
                {ordem.respondidoEm && (
                  <span className="ml-auto text-[11px] font-medium text-primary/60">
                    {new Date(ordem.respondidoEm).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
              <div className="p-6 pt-4">
                <p className="text-[14px] text-on-surface leading-relaxed whitespace-pre-wrap">{ordem.resposta}</p>
              </div>
            </div>
          )}

          {/* Notas internas */}
          {ordem.notas.map(nota => (
            <div key={nota.id} className="overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5 shadow-sm transition-colors hover:border-amber-500/40">
              <div className="flex items-center gap-2.5 px-6 pb-2 pt-6 border-b border-amber-500/10">
                <span className="material-symbols-outlined text-[18px] text-amber-600/70">lock</span>
                <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest text-amber-700">Nota interna</h2>
                <span className="ml-auto text-[11px] font-medium text-amber-700/50">
                  {new Date(nota.criadoEm).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="p-6 pt-4">
                <p className="text-[14px] text-on-surface leading-relaxed whitespace-pre-wrap">{nota.conteudo}</p>
              </div>
            </div>
          ))}

          {/* Avaliação */}
          {ordem.avaliacaoNota && (
            <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm transition-colors hover:border-outline-variant/40 p-5">
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold uppercase tracking-widest text-on-surface-variant">Avaliação</span>
                <div className="flex gap-1 border-l border-outline-variant/10 pl-3 ml-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <span key={n} className={`material-symbols-outlined text-[18px] ${n <= ordem.avaliacaoNota! ? 'text-amber-500' : 'text-on-surface-variant/20'}`} style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                </div>
                {ordem.avaliacaoComent && (
                  <p className="text-[13px] font-medium text-on-surface-variant/70 italic ml-2">"{ordem.avaliacaoComent}"</p>
                )}
              </div>
            </div>
          )}

          {/* Responder form */}
          {ordem.status !== 'resolvida' && ordem.status !== 'cancelada' && (
            <ChamadoResponderForm
              ordemId={id}
              clienteId={ordem.cliente.id}
              statusAtual={ordem.status}
              temResposta={!!ordem.resposta}
              clienteNome={ordem.cliente.nome}
              clienteEmail={ordem.cliente.email}
              clienteWpp={ordem.cliente.whatsapp ?? ordem.cliente.telefone}
              socios={sociosContato}
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm transition-colors hover:border-outline-variant/40">
            <div className="flex items-center gap-2.5 px-6 pb-2 pt-6 border-b border-outline-variant/5">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50">info</span>
              <h2 className="font-headline text-[13px] font-bold uppercase tracking-widest text-on-surface-variant">Informações</h2>
            </div>
            <div className="p-6 pt-4">
              <dl className="space-y-3.5 text-[13px]">
                <div className="flex items-start justify-between gap-4 py-2 border-b border-outline-variant/5 last:border-0">
                  <dt className="shrink-0 text-[13px] font-medium text-on-surface-variant/80">Cliente</dt>
                  <dd className="text-right">
                    <Link href={`/crm/clientes/${ordem.cliente.id}`} className="font-semibold text-primary transition-colors hover:text-primary/80">
                      {ordem.cliente.nome}
                    </Link>
                  </dd>
                </div>
                {nomeEmpresa && (
                  <div className="flex items-start justify-between gap-4 py-2 border-b border-outline-variant/5 last:border-0">
                    <dt className="shrink-0 text-[13px] font-medium text-on-surface-variant/80">Empresa</dt>
                    <dd className="text-right font-medium text-on-surface">{nomeEmpresa}</dd>
                  </div>
                )}
                <div className="flex items-start justify-between gap-4 py-2 border-b border-outline-variant/5 last:border-0">
                  <dt className="shrink-0 text-[13px] font-medium text-on-surface-variant/80">Tipo</dt>
                  <dd className="text-right font-medium text-on-surface">{TIPO_CHAMADO[ordem.tipo] ?? ordem.tipo}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-outline-variant/5 last:border-0">
                  <dt className="shrink-0 text-[13px] font-medium text-on-surface-variant/80">Prioridade</dt>
                  <dd className="text-right font-medium text-on-surface capitalize">{ordem.prioridade}</dd>
                </div>
                <div className="flex items-start justify-between gap-4 py-2 border-b border-outline-variant/5 last:border-0">
                  <dt className="shrink-0 text-[13px] font-medium text-on-surface-variant/80">Aberto em</dt>
                  <dd className="text-right font-medium text-on-surface">{new Date(ordem.criadoEm).toLocaleDateString('pt-BR')}</dd>
                </div>
                {ordem.fechadoEm && (
                  <div className="flex items-start justify-between gap-4 py-2 border-b border-outline-variant/5 last:border-0">
                    <dt className="shrink-0 text-[13px] font-medium text-on-surface-variant/80">Fechado em</dt>
                    <dd className="text-right font-medium text-on-surface">{new Date(ordem.fechadoEm).toLocaleDateString('pt-BR')}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
