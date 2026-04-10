'use client'

import { useState } from 'react'
import { formatCNPJ } from '@/lib/utils'

type Socio = {
  id: string
  nome: string
  cpf: string
  email?: string | null
  qualificacao?: string | null
  participacao?: any
  portalAccess: boolean
}

type EmpresaVinculo = {
  id: string
  empresaId: string
  principal: boolean
  empresa: {
    id: string
    cnpj?: string | null
    razaoSocial?: string | null
    nomeFantasia?: string | null
    regime?: string | null
    spedyConfigurado?: boolean
    procuracaoRFAtiva?: boolean
    socios: Socio[]
  }
}

type Props = {
  vinculos: EmpresaVinculo[]
}

const REGIME_LABELS: Record<string, string> = {
  MEI: 'MEI',
  SimplesNacional: 'Simples Nacional',
  LucroPresumido: 'Lucro Presumido',
  LucroReal: 'Lucro Real',
  Autonomo: 'Autônomo',
}

export function EmpresasAccordion({ vinculos }: Props) {
  const [openId, setOpenId] = useState<string | null>(
    vinculos.find(v => v.principal)?.empresaId ?? vinculos[0]?.empresaId ?? null,
  )

  if (vinculos.length === 0) return null

  return (
    <div className="space-y-3">
      {vinculos.map((v) => {
        const emp = v.empresa
        const isOpen = openId === emp.id
        const label = emp.nomeFantasia ?? emp.razaoSocial ?? (emp.cnpj ? formatCNPJ(emp.cnpj) : `Empresa ${emp.id.slice(0, 8)}`)

        return (
          <div
            key={emp.id}
            className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm transition-colors hover:border-outline-variant/40"
          >
            {/* Header — clicável */}
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : emp.id)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left"
            >
              <span
                className="material-symbols-outlined text-[18px] text-on-surface-variant/50 transition-transform duration-200"
                style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                expand_more
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-on-surface truncate">{label}</span>
                  {v.principal && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Principal
                    </span>
                  )}
                  {emp.regime && (
                    <span className="rounded-[4px] bg-surface-container px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant">
                      {REGIME_LABELS[emp.regime] ?? emp.regime}
                    </span>
                  )}
                </div>
                {emp.cnpj && (
                  <span className="text-[12px] text-on-surface-variant/60">{formatCNPJ(emp.cnpj)}</span>
                )}
              </div>
              <span className="text-[11px] text-on-surface-variant/40">
                {emp.socios.length} {emp.socios.length === 1 ? 'sócio' : 'sócios'}
              </span>
            </button>

            {/* Body — expandível */}
            {isOpen && (
              <div className="border-t border-outline-variant/10 px-5 pb-5 pt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Dados da empresa */}
                <div className="space-y-1">
                  {emp.razaoSocial && <Row label="Razão Social" value={emp.razaoSocial} />}
                  {emp.nomeFantasia && <Row label="Nome Fantasia" value={emp.nomeFantasia} />}
                  {emp.cnpj && <Row label="CNPJ" value={formatCNPJ(emp.cnpj)} />}
                  {emp.regime && <Row label="Regime" value={REGIME_LABELS[emp.regime] ?? emp.regime} />}
                </div>

                {/* Sócios */}
                {emp.socios.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2">
                      Sócios ({emp.socios.length})
                    </p>
                    <div className="space-y-2">
                      {emp.socios.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 rounded-lg bg-surface-container/50 px-3 py-2">
                          <span className="material-symbols-outlined text-[14px] text-on-surface-variant/40">person</span>
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-on-surface">{s.nome}</span>
                            {s.qualificacao && (
                              <span className="ml-2 text-[11px] text-on-surface-variant/60">{s.qualificacao}</span>
                            )}
                          </div>
                          {s.portalAccess && (
                            <span className="rounded-full bg-green-status/10 px-1.5 py-0.5 text-[9px] font-bold text-green-status">Portal</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-outline-variant/5 last:border-0">
      <span className="shrink-0 text-[13px] text-on-surface-variant/80">{label}</span>
      <span className="text-right text-[13px] font-medium text-on-surface">{value}</span>
    </div>
  )
}
