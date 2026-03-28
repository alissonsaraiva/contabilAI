import { auth } from '@/lib/auth-portal'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { OSAvaliacaoForm } from '@/components/portal/os-avaliacao-form'

const STATUS_OS: Record<string, { label: string; color: string; icon: string }> = {
  aberta:              { label: 'Aberta',            color: 'text-blue-600 bg-blue-500/10',    icon: 'radio_button_unchecked' },
  em_andamento:        { label: 'Em andamento',      color: 'text-primary bg-primary/10',      icon: 'autorenew' },
  aguardando_cliente:  { label: 'Aguardando você',   color: 'text-yellow-600 bg-yellow-500/10',icon: 'pending' },
  resolvida:           { label: 'Resolvida',         color: 'text-green-status bg-green-status/10', icon: 'task_alt' },
  cancelada:           { label: 'Cancelada',         color: 'text-on-surface-variant/50 bg-surface-container', icon: 'cancel' },
}

const TIPO_OS: Record<string, string> = {
  duvida:      'Dúvida',
  solicitacao: 'Solicitação',
  reclamacao:  'Reclamação',
  documento:   'Documento',
  outros:      'Outros',
}

const PRIORIDADE: Record<string, { label: string; color: string }> = {
  baixa:   { label: 'Baixa',   color: 'text-on-surface-variant/60 bg-surface-container' },
  media:   { label: 'Média',   color: 'text-blue-600 bg-blue-500/10' },
  alta:    { label: 'Alta',    color: 'text-yellow-600 bg-yellow-500/10' },
  urgente: { label: 'Urgente', color: 'text-error bg-error/10' },
}

type Props = { params: Promise<{ id: string }> }

export default async function OSDetailPage({ params }: Props) {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const { id } = await params
  const ordem   = await prisma.ordemServico.findFirst({
    where: { id, clienteId },
  })

  if (!ordem) notFound()

  const s  = STATUS_OS[ordem.status] ?? STATUS_OS.aberta
  const p  = PRIORIDADE[ordem.prioridade] ?? PRIORIDADE.media
  const podeAvaliar = ordem.status === 'resolvida' && !ordem.avaliacaoNota
  const podeCancelar = ordem.status === 'aberta'

  return (
    <div className="space-y-6">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link
          href="/portal/suporte"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-lg font-semibold text-on-surface truncate">{ordem.titulo}</h1>
          <p className="text-[12px] text-on-surface-variant/60">
            Chamado #{id.slice(-8)} · {TIPO_OS[ordem.tipo] ?? ordem.tipo}
          </p>
        </div>
      </div>

      {/* Status bar */}
      <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${s.color}`}>
            <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
            {s.label}
          </span>
          <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${p.color}`}>
            Prioridade {p.label}
          </span>
          <span className="ml-auto text-[12px] text-on-surface-variant/60">
            Aberto em {new Date(ordem.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
      </Card>

      {/* Conteúdo */}
      <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50">person</span>
          <span className="text-[12px] font-semibold text-on-surface-variant/70">Sua mensagem</span>
        </div>
        <p className="text-[14px] text-on-surface leading-relaxed whitespace-pre-wrap">{ordem.descricao}</p>
      </Card>

      {/* Resposta do escritório */}
      {ordem.resposta ? (
        <Card className="border-primary/20 bg-primary/5 p-5 rounded-[16px] shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
            <span className="text-[12px] font-semibold text-primary">Resposta do escritório</span>
            {ordem.respondidoEm && (
              <span className="ml-auto text-[11px] text-on-surface-variant/50">
                {new Date(ordem.respondidoEm).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          <p className="text-[14px] text-on-surface leading-relaxed whitespace-pre-wrap">{ordem.resposta}</p>
        </Card>
      ) : (
        <Card className="border-outline-variant/15 bg-surface-container-low/60 p-5 rounded-[16px] shadow-sm">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px] text-on-surface-variant/30">hourglass_empty</span>
            <p className="text-[13px] text-on-surface-variant/60">
              Aguardando resposta do escritório. Você será notificado quando houver uma atualização.
            </p>
          </div>
        </Card>
      )}

      {/* Avaliação */}
      {podeAvaliar && <OSAvaliacaoForm ordemId={id} />}
      {ordem.avaliacaoNota && (
        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[1,2,3,4,5].map(n => (
                <span key={n} className={`material-symbols-outlined text-[20px] ${n <= ordem.avaliacaoNota! ? 'text-yellow-500' : 'text-on-surface-variant/20'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  star
                </span>
              ))}
            </div>
            {ordem.avaliacaoComent && (
              <p className="text-[13px] text-on-surface-variant/70 italic">"{ordem.avaliacaoComent}"</p>
            )}
          </div>
        </Card>
      )}

      {/* Cancelar */}
      {podeCancelar && (
        <div className="flex justify-end">
          <Link
            href={`/portal/suporte/os/${id}/cancelar`}
            className="text-[12px] font-semibold text-error hover:underline"
          >
            Cancelar chamado
          </Link>
        </div>
      )}
    </div>
  )
}
