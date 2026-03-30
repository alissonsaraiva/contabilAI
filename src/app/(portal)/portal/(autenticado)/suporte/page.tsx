import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { getAiConfig } from '@/lib/ai/config'
import { Card } from '@/components/ui/card'
import Link from 'next/link'

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

const TIPO_COMUNICADO: Record<string, { label: string; color: string }> = {
  informativo: { label: 'Informativo', color: 'text-blue-600 bg-blue-500/10' },
  alerta:      { label: 'Alerta',      color: 'text-yellow-600 bg-yellow-500/10' },
  obrigacao:   { label: 'Obrigação',   color: 'text-error bg-error/10' },
  promocional: { label: 'Promoção',    color: 'text-green-status bg-green-status/10' },
}

export default async function PortalSuportePage() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const now = new Date()
  const [aiConfig, ordensRecentes, comunicados] = await Promise.all([
    getAiConfig(),
    prisma.ordemServico.findMany({
      where:   { clienteId },
      orderBy: { criadoEm: 'desc' },
      take:    5,
    }),
    prisma.comunicado.findMany({
      where: {
        publicado: true,
        OR: [{ expiradoEm: null }, { expiradoEm: { gt: now } }],
      },
      orderBy: { publicadoEm: 'desc' },
      take:    5,
      select: { id: true, titulo: true, conteudo: true, tipo: true, publicadoEm: true, anexoUrl: true, anexoNome: true },
    }),
  ])

  const nomeIa   = aiConfig.nomeAssistentes.portal ?? 'Assistente'
  const osAberta = ordensRecentes.filter(o => o.status === 'aberta' || o.status === 'em_andamento' || o.status === 'aguardando_cliente')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">Suporte</h1>
          <p className="text-sm text-on-surface-variant/70 mt-1">
            Abra chamados, acompanhe solicitações e veja comunicados do escritório.
          </p>
        </div>
        <Link
          href="/portal/suporte/os/nova"
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Novo chamado
        </Link>
      </div>

      {/* Clara CTA */}
      <Card className="border-outline-variant/15 bg-gradient-to-r from-primary/5 to-primary/10 p-5 rounded-[16px] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <span className="material-symbols-outlined text-[26px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
          </div>
          <div className="flex-1">
            <h2 className="text-[14px] font-semibold text-on-surface">{nomeIa} — Assistente Virtual</h2>
            <p className="text-[12px] text-on-surface-variant/70 mt-0.5">
              Tire dúvidas rápidas sobre contabilidade, obrigações e documentos. Disponível 24h.
            </p>
          </div>
          <p className="shrink-0 text-[12px] font-medium text-primary">
            → Botão azul no canto direito
          </p>
        </div>
      </Card>

      {/* Chamados abertos */}
      {osAberta.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-on-surface">Chamados em aberto</h2>
            <Link href="/portal/suporte/chamados" className="text-[12px] font-semibold text-primary hover:underline">
              Ver todos →
            </Link>
          </div>
          <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
            <ul className="divide-y divide-outline-variant/10">
              {osAberta.map(o => {
                const s = STATUS_OS[o.status] ?? STATUS_OS.aberta
                return (
                  <li key={o.id}>
                    <Link
                      href={`/portal/suporte/os/${o.id}`}
                      className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-container/50 transition-colors"
                    >
                      <span
                        className={`material-symbols-outlined mt-0.5 text-[18px] shrink-0 ${s.color.split(' ')[0]}`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {s.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-on-surface truncate">{o.titulo}</p>
                        <p className="text-[11px] text-on-surface-variant/60">
                          {TIPO_OS[o.tipo] ?? o.tipo} · {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                        {s.label}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      )}

      {/* Histórico de chamados */}
      {ordensRecentes.length === 0 ? (
        <Card className="border-outline-variant/15 bg-card/60 p-8 rounded-[16px] shadow-sm flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-[36px] text-on-surface-variant/25">inbox</span>
          <p className="text-[14px] font-semibold text-on-surface/70">Nenhum chamado ainda</p>
          <p className="text-[12px] text-on-surface-variant/60">
            Abra um chamado para solicitar suporte, tirar dúvidas ou enviar documentos.
          </p>
          <Link
            href="/portal/suporte/os/nova"
            className="mt-2 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Abrir primeiro chamado
          </Link>
        </Card>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-on-surface">Histórico recente</h2>
            <Link href="/portal/suporte/chamados" className="text-[12px] font-semibold text-primary hover:underline">
              Ver todos →
            </Link>
          </div>
          <Card className="border-outline-variant/15 bg-card/60 rounded-[16px] shadow-sm overflow-hidden">
            <ul className="divide-y divide-outline-variant/10">
              {ordensRecentes.map(o => {
                const s = STATUS_OS[o.status] ?? STATUS_OS.aberta
                return (
                  <li key={o.id}>
                    <Link
                      href={`/portal/suporte/os/${o.id}`}
                      className="flex items-start gap-3 px-5 py-3.5 hover:bg-surface-container/50 transition-colors"
                    >
                      <span
                        className={`material-symbols-outlined mt-0.5 text-[18px] shrink-0 ${s.color.split(' ')[0]}`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {s.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-on-surface truncate">{o.titulo}</p>
                        <p className="text-[11px] text-on-surface-variant/60">
                          {TIPO_OS[o.tipo] ?? o.tipo} · {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.color}`}>
                        {s.label}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      )}

      {/* Comunicados do escritório */}
      {comunicados.length > 0 && (
        <div>
          <h2 className="mb-3 text-[14px] font-semibold text-on-surface">Comunicados do escritório</h2>
          <div className="space-y-3">
            {comunicados.map(c => {
              const tc = TIPO_COMUNICADO[c.tipo] ?? TIPO_COMUNICADO.informativo
              return (
                <Card key={c.id} className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
                  <div className="flex items-start gap-3">
                    <span
                      className={`material-symbols-outlined mt-0.5 text-[20px] shrink-0 ${tc.color.split(' ')[0]}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {c.tipo === 'alerta' ? 'warning' : c.tipo === 'obrigacao' ? 'event_busy' : 'campaign'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[13px] font-semibold text-on-surface">{c.titulo}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tc.color}`}>
                          {tc.label}
                        </span>
                      </div>
                      <p className="text-[12px] text-on-surface-variant/80 leading-relaxed">{c.conteudo}</p>
                      {c.anexoUrl && (
                        <a
                          href={c.anexoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-surface-container px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-surface-container-high transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">download</span>
                          {c.anexoNome ?? 'Baixar anexo'}
                        </a>
                      )}
                      {c.publicadoEm && (
                        <p className="mt-1.5 text-[11px] text-on-surface-variant/50">
                          {new Date(c.publicadoEm).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
