import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'
import { Card } from '@/components/ui/card'
import { OSResponderForm } from '@/components/crm/os-responder-form'

const STATUS_OS: Record<string, { label: string; color: string }> = {
  aberta:              { label: 'Aberta',             color: 'text-blue-600 bg-blue-500/10' },
  em_andamento:        { label: 'Em andamento',       color: 'text-primary bg-primary/10' },
  aguardando_cliente:  { label: 'Aguardando cliente', color: 'text-yellow-600 bg-yellow-500/10' },
  resolvida:           { label: 'Resolvida',          color: 'text-green-status bg-green-status/10' },
  cancelada:           { label: 'Cancelada',          color: 'text-on-surface-variant/50 bg-surface-container' },
}

const TIPO_OS: Record<string, string> = {
  duvida: 'Dúvida', solicitacao: 'Solicitação', reclamacao: 'Reclamação', documento: 'Documento', outros: 'Outros',
}

type Props = { params: Promise<{ id: string }> }

export default async function CrmOSDetailPage({ params }: Props) {
  const session = await auth()
  if (!session) redirect('/crm/login')

  const { id } = await params
  const ordem   = await prisma.ordemServico.findUnique({
    where:   { id },
    include: {
      cliente: { select: { id: true, nome: true, email: true, telefone: true, whatsapp: true } },
      empresa: {
        select: {
          razaoSocial: true, nomeFantasia: true,
          socios: { select: { id: true, nome: true, whatsapp: true, telefone: true } },
        },
      },
    },
  })

  if (!ordem) notFound()

  // Sócios com algum contato WhatsApp
  const sociosContato = (ordem.empresa?.socios ?? [])
    .filter(s => s.whatsapp || s.telefone)
    .map(s => ({ id: s.id, nome: s.nome, telefone: (s.whatsapp || s.telefone)! }))

  const s         = STATUS_OS[ordem.status] ?? STATUS_OS.aberta
  const nomeEmpresa = ordem.empresa?.razaoSocial ?? ordem.empresa?.nomeFantasia

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Back */}
      <div className="flex items-center gap-3">
        <BackButton className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-colors">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </BackButton>
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-xl font-semibold text-on-surface truncate">{ordem.titulo}</h1>
          <p className="text-[12px] text-on-surface-variant/60">
            {TIPO_OS[ordem.tipo] ?? ordem.tipo} · #{id.slice(-8)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${s.color}`}>{s.label}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Main */}
        <div className="md:col-span-2 space-y-4">
          <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50">person</span>
              <span className="text-[12px] font-semibold text-on-surface-variant/70">Solicitação do cliente</span>
            </div>
            <p className="text-[14px] text-on-surface leading-relaxed whitespace-pre-wrap">{ordem.descricao}</p>
            <p className="mt-3 text-[11px] text-on-surface-variant/50">
              {new Date(ordem.criadoEm).toLocaleString('pt-BR')}
            </p>
          </Card>

          {/* Resposta existente */}
          {ordem.resposta && (
            <Card className="border-primary/20 bg-primary/5 p-5 rounded-[16px] shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
                <span className="text-[12px] font-semibold text-primary">Resposta do escritório</span>
                {ordem.respondidoEm && (
                  <span className="ml-auto text-[11px] text-on-surface-variant/50">
                    {new Date(ordem.respondidoEm).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
              <p className="text-[14px] text-on-surface leading-relaxed whitespace-pre-wrap">{ordem.resposta}</p>
            </Card>
          )}

          {/* Avaliação */}
          {ordem.avaliacaoNota && (
            <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold text-on-surface-variant/70">Avaliação:</span>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <span key={n} className={`material-symbols-outlined text-[18px] ${n <= ordem.avaliacaoNota! ? 'text-yellow-500' : 'text-on-surface-variant/20'}`} style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  ))}
                </div>
                {ordem.avaliacaoComent && (
                  <p className="text-[13px] text-on-surface-variant/70 italic">"{ordem.avaliacaoComent}"</p>
                )}
              </div>
            </Card>
          )}

          {/* Responder form */}
          {ordem.status !== 'resolvida' && ordem.status !== 'cancelada' && (
            <OSResponderForm
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

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
            <h3 className="text-[13px] font-semibold text-on-surface mb-3">Informações</h3>
            <dl className="space-y-2.5 text-[13px]">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 mb-0.5">Cliente</dt>
                <dd>
                  <Link href={`/crm/clientes/${ordem.cliente.id}`} className="font-medium text-primary hover:underline">
                    {ordem.cliente.nome}
                  </Link>
                </dd>
              </div>
              {nomeEmpresa && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 mb-0.5">Empresa</dt>
                  <dd className="text-on-surface">{nomeEmpresa}</dd>
                </div>
              )}
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 mb-0.5">Tipo</dt>
                <dd className="text-on-surface">{TIPO_OS[ordem.tipo] ?? ordem.tipo}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 mb-0.5">Prioridade</dt>
                <dd className="text-on-surface capitalize">{ordem.prioridade}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 mb-0.5">Aberto em</dt>
                <dd className="text-on-surface">{new Date(ordem.criadoEm).toLocaleDateString('pt-BR')}</dd>
              </div>
              {ordem.fechadoEm && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/50 mb-0.5">Fechado em</dt>
                  <dd className="text-on-surface">{new Date(ordem.fechadoEm).toLocaleDateString('pt-BR')}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  )
}
