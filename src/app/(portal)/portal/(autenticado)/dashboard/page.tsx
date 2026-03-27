import { auth } from '@/lib/auth-portal'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { formatBRL } from '@/lib/utils'
import { PLANO_LABELS } from '@/types'

async function getPortalData(clienteId: string) {
  const [cliente, documentosPendentes, tarefasRecentes, contrato] = await Promise.all([
    prisma.cliente.findUnique({
      where:  { id: clienteId },
      select: {
        nome: true, email: true, planoTipo: true, valorMensal: true,
        vencimentoDia: true, status: true, dataInicio: true,
      },
    }),
    prisma.documento.findMany({
      where:   { clienteId, status: 'pendente' },
      orderBy: { criadoEm: 'desc' },
      take:    5,
    }),
    prisma.tarefa.findMany({
      where:   { clienteId, status: { in: ['pendente', 'em_andamento'] } },
      orderBy: { prazo: 'asc' },
      take:    5,
    }),
    prisma.contrato.findFirst({
      where:   { clienteId },
      orderBy: { criadoEm: 'desc' },
      select:  { status: true, assinadoEm: true, clicksignSignUrl: true },
    }),
  ])

  return { cliente, documentosPendentes, tarefasRecentes, contrato }
}

const CONTRATO_STATUS: Record<string, { label: string; icon: string; color: string }> = {
  rascunho:              { label: 'Em preparação',      icon: 'edit_document',   color: 'text-on-surface-variant' },
  aguardando_assinatura: { label: 'Aguarda assinatura', icon: 'pending_actions', color: 'text-yellow-600' },
  assinado:              { label: 'Assinado',            icon: 'task_alt',        color: 'text-green-status' },
  cancelado:             { label: 'Cancelado',           icon: 'cancel',          color: 'text-error' },
  expirado:              { label: 'Expirado',            icon: 'event_busy',      color: 'text-on-surface-variant/60' },
}

export default async function PortalDashboardPage() {
  const session   = await auth()
  const clienteId = (session?.user as any)?.id
  if (!clienteId) redirect('/portal/login')

  const { cliente, documentosPendentes, tarefasRecentes, contrato } = await getPortalData(clienteId)
  if (!cliente) redirect('/portal/login')

  const planoLabel     = PLANO_LABELS[cliente.planoTipo] ?? cliente.planoTipo
  const contratoStatus = contrato ? (CONTRATO_STATUS[contrato.status] ?? CONTRATO_STATUS.rascunho) : null
  const primeiroNome   = cliente.nome.split(' ')[0]

  return (
    <div className="space-y-6">
      {/* Boas-vindas */}
      <div className="flex flex-col gap-1">
        <h1 className="font-headline text-2xl font-semibold text-on-surface">
          Olá, {primeiroNome}!
        </h1>
        <p className="text-sm text-on-surface-variant/70">
          Bem-vindo à sua área exclusiva. Aqui você acompanha tudo do seu escritório.
        </p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              assignment
            </span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Plano atual</p>
          <p className="text-[15px] font-bold text-on-surface mt-0.5">{planoLabel}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-green-status/10">
            <span className="material-symbols-outlined text-[20px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>
              payments
            </span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Mensalidade</p>
          <p className="text-[15px] font-bold text-on-surface mt-0.5">{formatBRL(Number(cliente.valorMensal))}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              event
            </span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Vencimento</p>
          <p className="text-[15px] font-bold text-on-surface mt-0.5">Dia {cliente.vencimentoDia}</p>
        </Card>

        <Card className="border-outline-variant/15 bg-card/60 p-4 rounded-[16px] shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-500/10">
            <span className="material-symbols-outlined text-[20px] text-yellow-600" style={{ fontVariationSettings: "'FILL' 1" }}>
              folder_open
            </span>
          </div>
          <p className="text-[12px] font-medium text-on-surface-variant/70">Docs pendentes</p>
          <p className="text-[15px] font-bold text-on-surface mt-0.5">{documentosPendentes.length}</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Contrato */}
        {contrato && contratoStatus && (
          <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">description</span>
              <h2 className="font-headline text-[14px] font-semibold text-on-surface">Contrato de prestação de serviços</h2>
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

        {/* Tarefas recentes */}
        <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant/60">check_circle</span>
            <h2 className="font-headline text-[14px] font-semibold text-on-surface">Atividades em andamento</h2>
          </div>
          {tarefasRecentes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/25">task_alt</span>
              <p className="text-[12px] text-on-surface-variant/50">Nenhuma atividade pendente</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {tarefasRecentes.map(t => (
                <li key={t.id} className="flex items-start gap-3 rounded-xl bg-surface-container-low/60 px-3 py-2.5">
                  <span
                    className="material-symbols-outlined mt-0.5 text-[16px] text-primary shrink-0"
                    style={{ fontVariationSettings: "'FILL' 0" }}
                  >
                    {t.status === 'em_andamento' ? 'autorenew' : 'radio_button_unchecked'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-on-surface truncate">{t.titulo}</p>
                    {t.prazo && (
                      <p className="text-[11px] text-on-surface-variant/60">
                        Prazo: {new Date(t.prazo).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                </li>
              ))}
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
                <span className="material-symbols-outlined text-[18px] text-yellow-600 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                  description
                </span>
                <p className="text-[13px] font-medium text-on-surface truncate flex-1">{d.nome}</p>
                <span className="shrink-0 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-700">
                  Pendente
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Precisa de ajuda */}
      <Card className="border-outline-variant/15 bg-card/60 p-5 rounded-[16px] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[24px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
          </div>
          <div className="flex-1">
            <h3 className="text-[14px] font-semibold text-on-surface">Precisa de ajuda?</h3>
            <p className="text-[12px] text-on-surface-variant/70 mt-0.5">
              Fale com a Clara, nossa assistente virtual, ou solicite atendimento humano.
            </p>
          </div>
          <Link
            href="/portal/suporte"
            className="shrink-0 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            Falar agora
          </Link>
        </div>
      </Card>
    </div>
  )
}
