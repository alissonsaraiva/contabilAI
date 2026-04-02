import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { BackButton } from '@/components/ui/back-button'
import { EscalacaoResponder } from '@/components/crm/escalacao-responder'
import { getAiConfig } from '@/lib/ai/config'

type Props = { params: Promise<{ id: string }> }

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  onboarding: 'Site (Onboarding)',
}

export default async function AtendimentoDetailPage({ params }: Props) {
  const { id } = await params
  const [esc, aiConfig] = await Promise.all([
    prisma.escalacao.findUnique({ where: { id } }),
    getAiConfig(),
  ])
  if (!esc) notFound()
  const nomeIa = (esc.canal === 'whatsapp' ? aiConfig.nomeAssistentes.whatsapp : aiConfig.nomeAssistentes.onboarding) ?? 'Assistente'

  const historico = (esc.historico as { role: string; content: string }[]) ?? []
  const resolvida = esc.status === 'resolvida'

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <BackButton className="flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Atendimentos
          </BackButton>
          <h1 className="text-3xl font-light tracking-tight text-on-surface">
            Atendimento — {CANAL_LABEL[esc.canal] ?? esc.canal}
          </h1>
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              resolvida
                ? 'bg-green-status/10 text-green-status'
                : esc.status === 'em_atendimento'
                ? 'bg-orange-status/10 text-orange-status'
                : 'bg-error/10 text-error'
            }`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {resolvida ? 'Resolvido' : esc.status === 'em_atendimento' ? 'Em atendimento' : 'Aguardando'}
            </span>
            <span className="inline-flex items-center rounded-md bg-surface-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
              {formatDateTime(esc.criadoEm)}
            </span>
          </div>
        </div>
      </div>

      {/* Motivo da IA */}
      {esc.motivoIA && (
        <div className="rounded-xl border border-orange-status/20 bg-orange-status/5 px-5 py-4 flex gap-3">
          <span className="material-symbols-outlined text-[18px] text-orange-status shrink-0 mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}>
            info
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-orange-status mb-1">
              Motivo do escalonamento ({nomeIa})
            </p>
            <p className="text-[13px] text-on-surface">{esc.motivoIA}</p>
          </div>
        </div>
      )}

      {/* Histórico da conversa */}
      <div className="rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <h2 className="mb-4 font-headline text-base font-semibold text-on-surface">
          Histórico da conversa
        </h2>
        {historico.length === 0 ? (
          <p className="text-[13px] text-on-surface-variant">Nenhum histórico disponível.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-1">
            {historico.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-primary text-white rounded-br-md'
                    : 'bg-surface-container-low text-on-surface rounded-bl-md'
                }`}>
                  <p className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${
                    m.role === 'user' ? 'text-white/60' : 'text-on-surface-variant/60'
                  }`}>
                    {m.role === 'user' ? 'Cliente' : nomeIa}
                  </p>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Responder — só exibe se não resolvida */}
      {resolvida ? (
        <div className="rounded-[14px] border border-green-status/20 bg-green-status/5 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-[20px] text-green-status"
              style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <h2 className="font-headline text-base font-semibold text-on-surface">
              Atendimento resolvido
            </h2>
          </div>
          {esc.orientacaoHumana && (
            <div className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Orientação dada
              </p>
              <p className="text-[13px] text-on-surface">{esc.orientacaoHumana}</p>
            </div>
          )}
          {esc.respostaEnviada && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                Mensagem enviada ao cliente
              </p>
              <p className="text-[13px] text-on-surface whitespace-pre-wrap">{esc.respostaEnviada}</p>
            </div>
          )}
        </div>
      ) : (
        <EscalacaoResponder
          escalacaoId={id}
          canal={esc.canal}
          nomeIa={nomeIa}
          entidadeId={esc.clienteId ?? esc.leadId ?? undefined}
          entidadeTipo={esc.clienteId ? 'cliente' : esc.leadId ? 'lead' : undefined}
        />
      )}
    </div>
  )
}
