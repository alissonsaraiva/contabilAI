import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { formatBRL } from '@/lib/utils'
import { PLANO_LABELS } from '@/types'

const CONTRATO_STATUS: Record<string, { label: string; icon: string; color: string }> = {
  rascunho:              { label: 'Em preparação',      icon: 'edit_document',   color: 'text-on-surface-variant' },
  aguardando_assinatura: { label: 'Aguarda assinatura', icon: 'pending_actions', color: 'text-yellow-600' },
  assinado:              { label: 'Assinado',            icon: 'task_alt',        color: 'text-green-status' },
  cancelado:             { label: 'Cancelado',           icon: 'cancel',          color: 'text-error' },
  expirado:              { label: 'Expirado',            icon: 'event_busy',      color: 'text-on-surface-variant/60' },
}

const STATUS_OS: Record<string, { label: string; color: string }> = {
  aberta:             { label: 'Aberta',          color: 'text-blue-600 bg-blue-500/10' },
  em_andamento:       { label: 'Em andamento',    color: 'text-primary bg-primary/10' },
  aguardando_cliente: { label: 'Aguardando você', color: 'text-yellow-600 bg-yellow-500/10' },
  resolvida:          { label: 'Resolvida',       color: 'text-green-status bg-green-status/10' },
  cancelada:          { label: 'Cancelada',       color: 'text-on-surface-variant/50 bg-surface-container' },
}

export default async function PortalDashboardPage() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const [cliente, documentosPendentes, contrato, ordensRecentes, comunicados] = await Promise.all([
    prisma.cliente.findUnique({
      where:   { id: clienteId },
      select: {
        nome: true, email: true, planoTipo: true, valorMensal: true,
        vencimentoDia: true, status: true, dataInicio: true,
        empresa: { select: { razaoSocial: true, nomeFantasia: true, regime: true } },
      },
    }),
    prisma.documento.findMany({
      where:   { clienteId, status: 'pendente' },
      orderBy: { criadoEm: 'desc' },
      take:    3,
    }),
    prisma.contrato.findFirst({
      where:   { clienteId },
      orderBy: { criadoEm: 'desc' },
      select:  { status: true, assinadoEm: true, clicksignSignUrl: true },
    }),
    prisma.ordemServico.findMany({
      where:   { clienteId },
      orderBy: { criadoEm: 'desc' },
      take:    3,
    }),
    prisma.comunicado.findMany({
      where: {
        publicado: true,
        OR: [{ expiradoEm: null }, { expiradoEm: { gt: new Date() } }],
      },
      orderBy: { publicadoEm: 'desc' },
      take:    2,
      select: { id: true, titulo: true, tipo: true },
    }),
  ])

  if (!cliente) redirect('/portal/login')

  const planoLabel     = PLANO_LABELS[cliente.planoTipo] ?? cliente.planoTipo
  const contratoStatus = contrato ? (CONTRATO_STATUS[contrato.status] ?? CONTRATO_STATUS.rascunho) : null
  const nomeParaSaudacao = user.tipo === 'socio' ? (user.name as string ?? cliente.nome) : cliente.nome
  const primeiroNome     = nomeParaSaudacao.split(' ')[0]
  const empresaNome      = cliente.empresa?.razaoSocial ?? cliente.empresa?.nomeFantasia

  return (
    <div className="space-y-6">
      {/* Banner inadimplência / suspensão */}
      {(cliente.status === 'inadimplente' || cliente.status === 'suspenso') && (
        <div className={`flex items-start gap-4 rounded-2xl border px-5 py-4 ${
          cliente.status === 'inadimplente'
            ? 'border-error/25 bg-error/8'
            : 'border-orange-status/25 bg-orange-status/8'
        }`}>
          <span
            className={`material-symbols-outlined mt-0.5 shrink-0 text-[22px] ${
              cliente.status === 'inadimplente' ? 'text-error' : 'text-orange-status'
            }`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {cliente.status === 'inadimplente' ? 'error' : 'warning'}
          </span>
          <div className="flex-1 min-w-0">
            <p className={`text-[14px] font-bold ${cliente.status === 'inadimplente' ? 'text-error' : 'text-orange-status'}`}>
              {cliente.status === 'inadimplente' ? 'Pagamento em aberto' : 'Conta suspensa'}
            </p>
            <p className={`mt-0.5 text-[13px] leading-relaxed ${cliente.status === 'inadimplente' ? 'text-error/80' : 'text-orange-status/80'}`}>
              {cliente.status === 'inadimplente'
                ? 'Identificamos uma pendência financeira na sua conta. Entre em contato com o escritório o quanto antes.'
                : 'Sua conta está temporariamente suspensa. Entre em contato com o escritório para regularizar.'}
            </p>
          </div>
          <Link
            href="/portal/suporte"
            className={`shrink-0 rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors ${
              cliente.status === 'inadimplente' ? 'bg-error hover:bg-error/90' : 'bg-orange-status hover:bg-orange-status/90'
            }`}
          >
            Falar agora
          </Link>
        </div>
      )}

      {/* Boas-vindas */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-semibold text-on-surface">
            Olá, {primeiroNome}!
          </h1>
          <p className="text-sm text-on-surface-variant/70 mt-0.5">
            {empresaNome ? `${empresaNome} · ` : ''}Bem-vindo ao seu portal exclusivo.
          </p>
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>assignment</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Plano atual</p>
          <p className="text-[15px] font-bold text-on-surface mt-0.5">{planoLabel}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-green-status/10">
            <span className="material-symbols-outlined text-[20px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>payments</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Mensalidade</p>
          <p className="text-[15px] font-bold text-on-surface mt-0.5">{formatBRL(Number(cliente.valorMensal))}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>event</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Vencimento</p>
          <p className="text-[15px] font-bold text-on-surface mt-0.5">Dia {cliente.vencimentoDia}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-500/10">
            <span className="material-symbols-outlined text-[20px] text-yellow-600" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Docs pendentes</p>
          <p className="text-[15px] font-bold text-on-surface mt-0.5">{documentosPendentes.length}</p>
        </Card>
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: '/portal/empresa',       icon: 'domain',         label: 'Minha empresa',  color: 'bg-primary/10 text-primary' },
          { href: '/portal/documentos',    icon: 'folder_open',    label: 'Documentos',     color: 'bg-yellow-500/10 text-yellow-600' },
          { href: '/portal/suporte/os/nova', icon: 'add_box',      label: 'Abrir chamado',  color: 'bg-green-status/10 text-green-status' },
          { href: '/portal/suporte',       icon: 'support_agent',  label: 'Suporte',        color: 'bg-orange-status/10 text-orange-status' },
        ].map(a => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center gap-2 rounded-[16px] border border-outline-variant/15 bg-card/60 px-4 py-4 text-center shadow-sm hover:bg-surface-container transition-colors"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${a.color}`}>
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>{a.icon}</span>
            </div>
            <span className="text-[12px] font-semibold text-on-surface">{a.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Contrato */}
        {contrato && contratoStatus && (
          <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">description</span>
              <h2 className="font-headline text-[14px] font-semibold text-on-surface">Contrato de serviços</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined text-[22px] ${contratoStatus.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                {contratoStatus.icon}
              </span>
              <div>
                <p className={`text-[14px] font-semibold ${contratoStatus.color}`}>{contratoStatus.label}</p>
                {contrato.assinadoEm && (
                  <p className="text-[12px] text-on-surface-variant/60">
                    Assinado em {new Date(contrato.assinadoEm).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
            {contrato.status === 'aguardando_assinatura' && contrato.clicksignSignUrl && (
              <a
                href={contrato.clicksignSignUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors w-fit"
              >
                <span className="material-symbols-outlined text-[16px]">draw</span>
                Assinar contrato
              </a>
            )}
          </Card>
        )}

        {/* Chamados recentes */}
        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">support_agent</span>
              <h2 className="font-headline text-[14px] font-semibold text-on-surface">Chamados recentes</h2>
            </div>
            <Link href="/portal/suporte/chamados" className="text-[12px] font-semibold text-primary hover:underline">
              Ver todos →
            </Link>
          </div>
          {ordensRecentes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <span className="material-symbols-outlined text-[28px] text-on-surface-variant/25">inbox</span>
              <p className="text-[12px] text-on-surface-variant/50">Nenhum chamado ainda</p>
              <Link
                href="/portal/suporte/os/nova"
                className="mt-1 rounded-xl bg-surface-container px-3 py-1.5 text-[12px] font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Abrir primeiro chamado
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {ordensRecentes.map(o => {
                const s = STATUS_OS[o.status] ?? STATUS_OS.aberta
                return (
                  <li key={o.id}>
                    <Link href={`/portal/suporte/os/${o.id}`} className="flex items-center gap-3 rounded-xl bg-surface-container-low/60 px-3 py-2.5 hover:bg-surface-container transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-on-surface truncate">{o.titulo}</p>
                        <p className="text-[11px] text-on-surface-variant/60">
                          {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
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
          )}
        </Card>
      </div>

      {/* Documentos pendentes */}
      {documentosPendentes.length > 0 && (
        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-yellow-600" style={{ fontVariationSettings: "'FILL' 1" }}>folder_open</span>
              <h2 className="font-headline text-[14px] font-semibold text-on-surface">Documentos aguardando envio</h2>
            </div>
            <Link href="/portal/documentos" className="text-[12px] font-semibold text-primary hover:underline">
              Ver todos →
            </Link>
          </div>
          <ul className="space-y-2">
            {documentosPendentes.map(d => (
              <li key={d.id} className="flex items-center gap-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15 px-3 py-2.5">
                <span className="material-symbols-outlined text-[18px] text-yellow-600 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
                <p className="text-[13px] font-medium text-on-surface truncate flex-1">{d.nome}</p>
                <span className="shrink-0 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-700">Pendente</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Comunicados */}
      {comunicados.length > 0 && (
        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
            <h2 className="font-headline text-[14px] font-semibold text-on-surface">Comunicados do escritório</h2>
            <Link href="/portal/suporte" className="ml-auto text-[12px] font-semibold text-primary hover:underline">
              Ver todos →
            </Link>
          </div>
          <ul className="space-y-2">
            {comunicados.map(c => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/10 px-3 py-2.5">
                <span className="material-symbols-outlined text-[18px] text-primary shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
                <p className="text-[13px] font-medium text-on-surface truncate flex-1">{c.titulo}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
