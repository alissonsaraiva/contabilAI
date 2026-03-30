import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import Link from 'next/link'
import { formatBRL, cn } from '@/lib/utils'
import { PLANO_LABELS } from '@/types'

/* ─── helpers de status ─── */
const STATUS_OS: Record<string, { label: string; color: string }> = {
  aberta:             { label: 'Aberta',       color: 'bg-primary/10 text-primary' },
  em_andamento:       { label: 'Em andamento', color: 'bg-orange-status/10 text-orange-status' },
  aguardando_cliente: { label: 'Aguardando',   color: 'bg-yellow-500/10 text-yellow-700' },
  resolvida:          { label: 'Resolvida',    color: 'bg-green-status/10 text-green-status' },
  cancelada:          { label: 'Cancelada',    color: 'bg-surface-container text-on-surface-variant/50' },
}

const REGIME_LABEL: Record<string, string> = {
  MEI:             'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido:  'Lucro Presumido',
  LucroReal:       'Lucro Real',
  Autonomo:        'Autônomo',
}

/* Obrigações fiscais estáticas por regime/tipo */
function getObrigacoes(regime: string | null | undefined, tipo: string): { label: string; vence: string; cor: string }[] {
  if (tipo === 'pf') {
    return [
      { label: 'IRPF — Imposto de Renda PF',  vence: 'Abr/2026', cor: 'text-orange-status' },
      { label: 'CARNÊ-LEÃO (se aplicável)',     vence: 'Mensal',   cor: 'text-primary' },
    ]
  }
  if (regime === 'MEI') {
    return [
      { label: 'DAS-MEI',                         vence: 'Dia 20/mês', cor: 'text-primary' },
      { label: 'DASN-SIMEI (anual)',               vence: 'Mai/2026',   cor: 'text-orange-status' },
      { label: 'NF de Serviços (se prestador)',    vence: 'Mensal',     cor: 'text-on-surface-variant' },
    ]
  }
  if (regime === 'SimplesNacional') {
    return [
      { label: 'DAS — Simples Nacional',           vence: 'Dia 20/mês', cor: 'text-primary' },
      { label: 'DEFIS (anual)',                    vence: 'Mar/2026',   cor: 'text-orange-status' },
      { label: 'DCTF (se aplicável)',              vence: 'Mensal',     cor: 'text-on-surface-variant' },
    ]
  }
  return [
    { label: 'DCTF Mensal',                       vence: 'Dia 15/mês', cor: 'text-primary' },
    { label: 'EFD-Contribuições',                 vence: 'Dia 10/mês', cor: 'text-orange-status' },
    { label: 'SPED Contábil (anual)',             vence: 'Jun/2026',   cor: 'text-on-surface-variant' },
    { label: 'ECF (anual)',                       vence: 'Jul/2026',   cor: 'text-on-surface-variant' },
  ]
}

/* Extensão de arquivo p/ badge */
function getExt(nome: string): string {
  const ext = nome.split('.').pop()?.toUpperCase() ?? 'DOC'
  return ext
}
function extColor(ext: string): string {
  if (ext === 'PDF') return 'bg-error/10 text-error'
  if (ext === 'XML') return 'bg-green-status/10 text-green-status'
  if (ext === 'XLS' || ext === 'XLSX') return 'bg-green-status/10 text-green-status'
  return 'bg-primary/10 text-primary'
}

export default async function PortalDashboardPage() {
  const session = await auth()
  const user    = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const [cliente, documentos, ordensRecentes, comunicados] = await Promise.all([
    prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: {
        nome: true, email: true, cpf: true, planoTipo: true, valorMensal: true,
        vencimentoDia: true, status: true, dataInicio: true, tipoContribuinte: true,
        responsavel: { select: { nome: true } },
        empresa: {
          select: {
            cnpj: true, razaoSocial: true, nomeFantasia: true, regime: true,
          },
        },
      },
    }),
    prisma.documento.findMany({
      where:   { clienteId },
      orderBy: { criadoEm: 'desc' },
      take:    6,
      select:  { id: true, nome: true, tipo: true, url: true, criadoEm: true, status: true },
    }),
    prisma.ordemServico.findMany({
      where:   { clienteId },
      orderBy: { criadoEm: 'desc' },
      take:    4,
      select:  { id: true, titulo: true, status: true, criadoEm: true, tipo: true },
    }),
    prisma.comunicado.findMany({
      where: {
        publicado: true,
        OR: [{ expiradoEm: null }, { expiradoEm: { gt: new Date() } }],
      },
      orderBy: { publicadoEm: 'desc' },
      take:    3,
      select:  { id: true, titulo: true, tipo: true, publicadoEm: true },
    }),
  ])

  if (!cliente) redirect('/portal/login')

  const primeiroNome = (user.tipo === 'socio' ? (user.name ?? cliente.nome) : cliente.nome).split(' ')[0]
  const empresa       = cliente.empresa
  const regime        = empresa?.regime ?? null
  const obrigacoes    = getObrigacoes(regime, cliente.tipoContribuinte)
  const chamadosAbertos = ordensRecentes.filter(o => o.status !== 'resolvida' && o.status !== 'cancelada').length
  const docsDisponiveis = documentos.length

  return (
    <div className="space-y-6">

      {/* ── Alerta status ── */}
      {(cliente.status === 'inadimplente' || cliente.status === 'suspenso') && (
        <div className={cn(
          'flex items-start gap-4 rounded-2xl border px-5 py-4',
          cliente.status === 'inadimplente' ? 'border-error/25 bg-error/8' : 'border-orange-status/25 bg-orange-status/8',
        )}>
          <span
            className={cn('material-symbols-outlined mt-0.5 shrink-0 text-[22px]', cliente.status === 'inadimplente' ? 'text-error' : 'text-orange-status')}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {cliente.status === 'inadimplente' ? 'error' : 'warning'}
          </span>
          <div className="flex-1 min-w-0">
            <p className={cn('text-[14px] font-bold', cliente.status === 'inadimplente' ? 'text-error' : 'text-orange-status')}>
              {cliente.status === 'inadimplente' ? 'Pagamento em aberto' : 'Conta suspensa'}
            </p>
            <p className={cn('mt-0.5 text-[13px] leading-relaxed', cliente.status === 'inadimplente' ? 'text-error/80' : 'text-orange-status/80')}>
              {cliente.status === 'inadimplente'
                ? 'Há uma pendência financeira. Entre em contato com o escritório.'
                : 'Sua conta está suspensa temporariamente. Entre em contato para regularizar.'}
            </p>
          </div>
          <Link
            href="/portal/suporte"
            className={cn('shrink-0 rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors', cliente.status === 'inadimplente' ? 'bg-error hover:bg-error/90' : 'bg-orange-status hover:bg-orange-status/90')}
          >
            Falar agora
          </Link>
        </div>
      )}

      {/* ── Header ── */}
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Olá, {primeiroNome}! 👋</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant/70">
          {empresa?.nomeFantasia ?? empresa?.razaoSocial ?? ''}{empresa ? ' · ' : ''}Bem-vindo ao seu portal.
        </p>
      </div>

      {/* ── 2 colunas ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">

        {/* ── COLUNA ESQUERDA ── */}
        <div className="flex flex-col gap-5">

          {/* Obrigações fiscais */}
          <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[20px]">📅</span>
                <h2 className="font-headline text-[14px] font-semibold text-on-surface">Obrigações fiscais</h2>
              </div>
              {regime && (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  {REGIME_LABEL[regime] ?? regime}
                </span>
              )}
            </div>
            <ul className="divide-y divide-outline-variant/8">
              {obrigacoes.map((o, i) => (
                <li key={i} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-2 w-2 shrink-0 rounded-full bg-current opacity-60" style={{ color: 'currentcolor' }} />
                    <p className={cn('text-[13px] font-medium truncate', o.cor)}>{o.label}</p>
                  </div>
                  <span className="shrink-0 text-[12px] font-semibold text-on-surface-variant/70">{o.vence}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-outline-variant/8 px-5 py-3">
              <p className="text-[11px] text-on-surface-variant/50">
                Dúvidas sobre obrigações? Abra um chamado ou fale com a Clara.
              </p>
            </div>
          </div>

          {/* Documentos disponíveis */}
          <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[20px]">📄</span>
                <h2 className="font-headline text-[14px] font-semibold text-on-surface">Documentos disponíveis</h2>
              </div>
              <Link href="/portal/documentos" className="text-[12px] font-semibold text-primary hover:underline">
                Ver todos →
              </Link>
            </div>

            {documentos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="text-3xl">📭</span>
                <p className="text-[13px] text-on-surface-variant/60">Nenhum documento disponível ainda</p>
              </div>
            ) : (
              <ul className="divide-y divide-outline-variant/8">
                {documentos.map(d => {
                  const ext = getExt(d.nome)
                  return (
                    <li key={d.id}>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-5 py-3 hover:bg-surface-container-lowest/40 transition-colors"
                      >
                        <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', extColor(ext))}>
                          {ext}
                        </span>
                        <p className="flex-1 min-w-0 text-[13px] font-medium text-on-surface truncate">{d.nome}</p>
                        <span className="shrink-0 text-[11px] text-on-surface-variant/50">
                          {new Date(d.criadoEm).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="material-symbols-outlined shrink-0 text-[16px] text-on-surface-variant/30">download</span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* Meus chamados */}
          <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[20px]">🎫</span>
                <h2 className="font-headline text-[14px] font-semibold text-on-surface">Meus chamados</h2>
                {chamadosAbertos > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">
                    {chamadosAbertos}
                  </span>
                )}
              </div>
              <Link
                href="/portal/suporte/os/nova"
                className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Abrir chamado
              </Link>
            </div>

            {ordensRecentes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="text-3xl">✅</span>
                <p className="text-[13px] text-on-surface-variant/60">Nenhum chamado ainda</p>
                <Link
                  href="/portal/suporte/os/nova"
                  className="mt-1 rounded-xl border border-outline-variant/20 bg-surface-container px-4 py-2 text-[12px] font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  Abrir primeiro chamado
                </Link>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-outline-variant/8">
                  {ordensRecentes.map(o => {
                    const s = STATUS_OS[o.status] ?? STATUS_OS.aberta
                    return (
                      <li key={o.id}>
                        <Link
                          href={`/portal/suporte/os/${o.id}`}
                          className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-container-lowest/40 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-on-surface truncate">{o.titulo}</p>
                            <p className="text-[11px] text-on-surface-variant/60">
                              {new Date(o.criadoEm).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', s.color)}>
                            {s.label}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
                <div className="border-t border-outline-variant/8 px-5 py-3 text-right">
                  <Link href="/portal/suporte" className="text-[12px] font-semibold text-primary hover:underline">
                    Ver todos os chamados →
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Comunicados */}
          {comunicados.length > 0 && (
            <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-[20px]">📢</span>
                  <h2 className="font-headline text-[14px] font-semibold text-on-surface">Comunicados do escritório</h2>
                </div>
              </div>
              <ul className="divide-y divide-outline-variant/8">
                {comunicados.map(c => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-[16px]">
                      {c.tipo === 'alerta' ? '⚠️' : c.tipo === 'obrigacao' ? '📋' : '📢'}
                    </div>
                    <p className="flex-1 min-w-0 text-[13px] font-medium text-on-surface truncate">{c.titulo}</p>
                    {c.publicadoEm && (
                      <span className="shrink-0 text-[11px] text-on-surface-variant/50">
                        {new Date(c.publicadoEm).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── COLUNA DIREITA ── */}
        <div className="flex flex-col gap-5">

          {/* Info do cliente */}
          <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="text-[20px]">{cliente.tipoContribuinte === 'pf' ? '🪪' : '🏛️'}</span>
              <h2 className="font-headline text-[14px] font-semibold text-on-surface">
                {cliente.tipoContribuinte === 'pf' ? 'Meus dados' : 'Minha empresa'}
              </h2>
            </div>
            <dl className="space-y-2.5">
              {empresa?.cnpj && (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">CNPJ</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{empresa.cnpj}</dd>
                </div>
              )}
              {!empresa && cliente.cpf && (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">CPF</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{cliente.cpf}</dd>
                </div>
              )}
              {empresa?.razaoSocial && (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Razão social</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{empresa.razaoSocial}</dd>
                </div>
              )}
              {regime && (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Regime tributário</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{REGIME_LABEL[regime] ?? regime}</dd>
                </div>
              )}
              {cliente.responsavel?.nome && (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Contador responsável</dt>
                  <dd className="mt-0.5 text-[13px] font-medium text-on-surface">{cliente.responsavel.nome}</dd>
                </div>
              )}
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Plano</dt>
                <dd className="mt-0.5">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    {PLANO_LABELS[cliente.planoTipo] ?? cliente.planoTipo}
                  </span>
                </dd>
              </div>
            </dl>
            <Link
              href="/portal/empresa"
              className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              Ver / editar dados
            </Link>
          </div>

          {/* Resumo do ano */}
          <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="text-[20px]">📊</span>
              <h2 className="font-headline text-[14px] font-semibold text-on-surface">Resumo do ano</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className="text-[24px] font-bold text-primary leading-none">{docsDisponiveis}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Documentos</p>
              </div>
              <div className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className="text-[24px] font-bold text-on-surface leading-none">{ordensRecentes.length}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Chamados</p>
              </div>
              <div className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className="text-[24px] font-bold text-green-status leading-none">{formatBRL(Number(cliente.valorMensal))}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Mensalidade</p>
              </div>
              <div className="rounded-xl bg-surface-container-low p-3 text-center">
                <p className="text-[24px] font-bold text-on-surface leading-none">
                  {cliente.dataInicio ? new Date().getFullYear() - new Date(cliente.dataInicio).getFullYear() : '—'}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">Anos conosco</p>
              </div>
            </div>
          </div>

          {/* Acesso rápido */}
          <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="text-[20px]">⚡</span>
              <h2 className="font-headline text-[14px] font-semibold text-on-surface">Acesso rápido</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: '/portal/documentos',      icon: '📄', label: 'Documentos' },
                { href: '/portal/suporte/os/nova', icon: '🎫', label: 'Abrir chamado' },
                { href: '/portal/empresa',         icon: '🏛️', label: 'Minha empresa' },
                { href: '/portal/suporte',         icon: '💬', label: 'Suporte' },
              ].map(a => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-outline-variant/15 bg-surface-container-low py-3 text-center transition-colors hover:bg-surface-container"
                >
                  <span className="text-[22px]">{a.icon}</span>
                  <span className="text-[11px] font-semibold text-on-surface-variant">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
