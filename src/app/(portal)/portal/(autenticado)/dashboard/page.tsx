import { Suspense } from 'react'
import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { resolveClienteId } from '@/lib/portal-session'
import { getAiConfig } from '@/lib/ai/config'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AutoRefresh } from '@/components/ui/auto-refresh'

import { CardObrigacoes }   from './_components/card-obrigacoes'
import { CardDocumentos }   from './_components/card-documentos'
import { CardChamados }     from './_components/card-chamados'
import { CardComunicados }  from './_components/card-comunicados'
import { CardCobranca }     from './_components/card-cobranca'
import { CardInfoCliente }  from './_components/card-info-cliente'
import { CardResumoAno }    from './_components/card-resumo-ano'
import { CardListSkeleton, CardSmallSkeleton, CardResumoSkeleton } from './_components/skeletons'

export default async function PortalDashboardPage() {
  const session = await auth()
  const user = session?.user as any
  if (!user || (user.tipo !== 'cliente' && user.tipo !== 'socio')) redirect('/portal/login')

  const clienteId = await resolveClienteId(user)
  if (!clienteId) redirect('/portal/login')

  const [aiConfig, cliente] = await Promise.all([
    getAiConfig(),
    prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        nome: true, cpf: true, planoTipo: true, valorMensal: true,
        dataInicio: true, status: true, tipoContribuinte: true,
        responsavel: { select: { nome: true } },
        empresa: {
          select: { cnpj: true, razaoSocial: true, nomeFantasia: true, regime: true, procuracaoRFAtiva: true },
        },
      },
    }),
  ])

  if (!cliente) redirect('/portal/login')

  const nomeIa = aiConfig.nomeAssistentes.portal ?? 'Assistente'
  const primeiroNome = (user.tipo === 'socio' ? (user.name ?? cliente.nome) : cliente.nome).split(' ')[0]
  const empresa = cliente.empresa
  const regime = empresa?.regime ?? null

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />

      {/* ── Alerta de status ── */}
      {(cliente.status === 'inadimplente' || cliente.status === 'suspenso') && (
        <div className={cn(
          'flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-2xl border p-4 sm:px-5 sm:py-4',
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
          <div className="w-full sm:w-auto pt-2 sm:pt-0">
            <Link
              href="/portal/suporte"
              className={cn('flex justify-center shrink-0 rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors', cliente.status === 'inadimplente' ? 'bg-error hover:bg-error/90' : 'bg-orange-status hover:bg-orange-status/90')}
            >
              Falar agora
            </Link>
          </div>
        </div>
      )}

      {/* ── Alerta procuração RF ── */}
      {regime === 'MEI' && empresa?.procuracaoRFAtiva === false && (
        <Link
          href="/portal/procuracao-rf"
          className="flex items-start gap-3.5 rounded-2xl border border-error/30 bg-error/8 px-5 py-4 transition-opacity hover:opacity-90"
        >
          <span
            className="material-symbols-outlined shrink-0 text-[22px] text-error mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            lock_person
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-error">Autorização Receita Federal pendente</p>
            <p className="mt-0.5 text-[13px] text-error/80 leading-relaxed">
              Você ainda não concedeu a procuração digital ao escritório. Sem ela, sua DAS MEI não pode ser gerada automaticamente.{' '}
              <span className="font-semibold underline underline-offset-2">Clique aqui para ver como resolver</span>.
            </p>
          </div>
          <span className="material-symbols-outlined shrink-0 text-[18px] text-error/60 mt-0.5">chevron_right</span>
        </Link>
      )}

      {/* ── Saudação ── */}
      <div>
        <h1 className="font-headline text-2xl font-semibold text-on-surface">Olá, {primeiroNome}! 👋</h1>
        <p className="mt-0.5 text-sm text-on-surface-variant/70">
          {empresa?.nomeFantasia ?? empresa?.razaoSocial ?? ''}{empresa ? ' · ' : ''}Bem-vindo ao seu portal.
        </p>
      </div>

      {/* ── Layout 2 colunas ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">

        {/* ── Coluna principal ── */}
        <div className="flex min-w-0 flex-col gap-5">
          <CardObrigacoes regime={regime} tipo={cliente.tipoContribuinte} nomeIa={nomeIa} />

          <Suspense fallback={<CardListSkeleton rows={4} />}>
            <CardDocumentos clienteId={clienteId} />
          </Suspense>

          <Suspense fallback={<CardListSkeleton rows={3} />}>
            <CardChamados clienteId={clienteId} />
          </Suspense>

          <Suspense fallback={null}>
            <CardComunicados />
          </Suspense>
        </div>

        {/* ── Sidebar ── */}
        <div className="flex min-w-0 flex-col gap-5">
          <Suspense fallback={<CardSmallSkeleton />}>
            <CardCobranca clienteId={clienteId} />
          </Suspense>

          <CardInfoCliente
            tipoContribuinte={cliente.tipoContribuinte}
            cpf={cliente.cpf}
            planoTipo={cliente.planoTipo}
            responsavelNome={cliente.responsavel?.nome}
            empresa={empresa}
          />

          <Suspense fallback={<CardResumoSkeleton />}>
            <CardResumoAno
              clienteId={clienteId}
              valorMensal={Number(cliente.valorMensal)}
              dataInicio={cliente.dataInicio}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
