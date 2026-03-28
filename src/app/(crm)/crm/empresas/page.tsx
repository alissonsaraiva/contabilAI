import { prisma } from '@/lib/prisma'
import { formatCNPJ } from '@/lib/utils'
import Link from 'next/link'

const REGIME_LABELS: Record<string, string> = {
  MEI: 'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido: 'Lucro Presumido',
  LucroReal: 'Lucro Real',
  Autonomo: 'Autônomo',
}

const REGIME_COLORS: Record<string, string> = {
  MEI: 'bg-green-status/10 text-green-status',
  SimplesNacional: 'bg-primary/10 text-primary',
  LucroPresumido: 'bg-tertiary/10 text-tertiary',
  LucroReal: 'bg-orange-status/10 text-orange-status',
  Autonomo: 'bg-surface-container text-on-surface-variant',
}

const STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-status/10 text-green-status',
  inativo: 'bg-error/10 text-error',
  inadimplente: 'bg-orange-status/10 text-orange-status',
  rescindido: 'bg-surface-container text-on-surface-variant',
  suspenso: 'bg-tertiary/10 text-tertiary',
}

const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  inadimplente: 'Inadimplente',
  rescindido: 'Rescindido',
  suspenso: 'Suspenso',
}

export default async function EmpresasPage() {
  const empresas = await prisma.empresa.findMany({
    orderBy: { criadoEm: 'desc' },
    include: {
      cliente: { select: { id: true, nome: true, email: true, planoTipo: true, valorMensal: true, status: true } },
      socios: { select: { id: true } },
    },
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-on-surface">
            Empresas
            <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-bold text-on-surface-variant border border-outline-variant/20">
              {empresas.length} total
            </span>
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Todas as empresas vinculadas à carteira de clientes.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card shadow-sm">
        {empresas.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant/25">domain</span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/40">
              Nenhuma empresa ainda.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-outline-variant/15">
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Empresa</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">CNPJ</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Regime</th>
                  <th className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Titular</th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Sócios</th>
                  <th className="px-6 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {empresas.map((e) => (
                  <tr key={e.id} className="group hover:bg-surface-container-low/40 transition-colors">
                    <td className="px-6 py-3.5">
                      <Link href={`/crm/empresas/${e.id}`} className="block">
                        <span className="block text-[14px] font-semibold text-on-surface group-hover:text-primary transition-colors">
                          {e.razaoSocial ?? e.nomeFantasia ?? '(sem nome)'}
                        </span>
                        {e.nomeFantasia && e.razaoSocial && (
                          <span className="block text-xs text-on-surface-variant/80 mt-0.5">{e.nomeFantasia}</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-[13px] text-on-surface-variant/90">
                        {e.cnpj ? formatCNPJ(e.cnpj) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      {e.regime ? (
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${REGIME_COLORS[e.regime] ?? 'bg-surface-container text-on-surface-variant'}`}>
                          {REGIME_LABELS[e.regime] ?? e.regime}
                        </span>
                      ) : (
                        <span className="text-[13px] text-on-surface-variant/40">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      {e.cliente ? (
                        <div>
                          <span className="block text-[13px] font-medium text-on-surface">{e.cliente.nome}</span>
                          <span className="block text-xs text-on-surface-variant/70">{e.cliente.email}</span>
                        </div>
                      ) : (
                        <span className="text-[13px] text-on-surface-variant/40">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className="text-[13px] font-semibold text-on-surface-variant">{e.socios.length}</span>
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[e.status] ?? 'bg-surface-container text-on-surface-variant'}`}>
                        {STATUS_LABELS[e.status] ?? e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
