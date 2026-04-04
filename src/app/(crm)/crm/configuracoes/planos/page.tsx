import { prisma } from '@/lib/prisma'
import { formatBRL } from '@/lib/utils'
import { PLANO_LABELS, PLANO_COLORS } from '@/types'
import type { PlanoTipo } from '@prisma/client'
import { PlanoDrawer } from '@/components/crm/plano-drawer'
import { PlanoActionsMenu } from '@/components/crm/plano-actions-menu'
import { PlanoDeleteButton } from '@/components/crm/plano-delete-button'

const TODOS_TIPOS: PlanoTipo[] = ['essencial', 'profissional', 'empresarial', 'startup']

export default async function PlanosPage() {
  const planos = await prisma.plano.findMany({ orderBy: { valorMinimo: 'asc' } })

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-outline-variant/20 bg-card p-4 md:p-6 shadow-sm">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface">Planos Disponíveis</h2>
            <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/70">
              Planos exibidos no onboarding e na landing page.
            </p>
          </div>
          <PlanoDrawer tiposDisponiveis={TODOS_TIPOS} />
        </div>

        {planos.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-outline-variant/30">
            <span className="material-symbols-outlined text-[36px] text-on-surface-variant/30">payments</span>
            <div className="text-center">
              <p className="text-[13px] font-medium text-on-surface-variant">Nenhum plano cadastrado.</p>
              <p className="text-[12px] text-on-surface-variant/60">Clique em "Novo Plano" para começar.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {planos.map(p => {
              const tipo = p.tipo as PlanoTipo
              const servicos = (p.servicos ?? []) as string[]
              return (
                <div
                  key={p.id}
                  className={`group relative rounded-[12px] border p-5 transition-all
                    ${!p.ativo ? 'opacity-50' : ''}
                    ${p.destaque ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10' : 'border-outline-variant/15 bg-surface-container-low'}`}
                >
                  {/* Actions */}
                  <div className="absolute right-3 top-3">
                    <PlanoActionsMenu plano={{ id: p.id, tipo, ativo: p.ativo, destaque: p.destaque }} />
                  </div>

                  <div className="mb-3 flex items-start justify-between pr-8">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${PLANO_COLORS[tipo] ?? 'bg-surface-container text-on-surface-variant'}`}>
                          {PLANO_LABELS[tipo]}
                        </span>
                        {p.destaque && (
                          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                            Destaque
                          </span>
                        )}
                        {!p.ativo && (
                          <span className="rounded-md bg-surface-container px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50">
                            Inativo
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/80">{p.nome}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-medium text-on-surface-variant/60">a partir de</p>
                      <p className="text-lg font-semibold text-on-surface">{formatBRL(Number(p.valorMinimo))}</p>
                      <p className="text-[11px] text-on-surface-variant/50">até {formatBRL(Number(p.valorMaximo))}</p>
                    </div>
                  </div>

                  {p.descricao && (
                    <p className="mb-3 text-[12px] leading-relaxed text-on-surface-variant/80">{p.descricao}</p>
                  )}

                  {servicos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-outline-variant/10">
                      {servicos.map(s => (
                        <span key={s} className="rounded-md bg-surface-container px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Edit / Delete */}
                  <div className="mt-4 pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                    <PlanoDrawer
                      plano={{
                        id: p.id,
                        tipo,
                        nome: p.nome,
                        descricao: p.descricao ?? '',
                        valorMinimo: Number(p.valorMinimo),
                        valorMaximo: Number(p.valorMaximo),
                        servicos,
                        destaque: p.destaque,
                        ativo: p.ativo,
                      }}
                      tiposDisponiveis={[]}
                    />
                    <PlanoDeleteButton id={p.id} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
