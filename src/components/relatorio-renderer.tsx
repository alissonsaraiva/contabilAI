'use client'

import { useState } from 'react'
import type { RelatorioJSON, RelatorioSecaoTabela } from '@/lib/relatorio-schema'

// ── KPI Cards ────────────────────────────────────────────────────────────────

function KPICard({ label, valor, destaque }: { label: string; valor: string | number; destaque?: string }) {
  const corValor =
    destaque === 'danger'  ? 'text-error' :
    destaque === 'warning' ? 'text-amber-500' :
    destaque === 'ok'      ? 'text-green-600' :
    'text-on-surface'

  const bg =
    destaque === 'danger'  ? 'border-error/20 bg-error/5' :
    destaque === 'warning' ? 'border-amber-200 bg-amber-50' :
    destaque === 'ok'      ? 'border-green-200 bg-green-50' :
    'border-outline-variant/20 bg-surface-container-low/50'

  return (
    <div className={`flex flex-col gap-1 rounded-xl border px-4 py-3 ${bg}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">{label}</span>
      <span className={`text-[22px] font-bold leading-none ${corValor}`}>{String(valor)}</span>
    </div>
  )
}

// ── Tabela ───────────────────────────────────────────────────────────────────

function TabelaSecao({ secao }: { secao: RelatorioSecaoTabela }) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  function toggleSort(colIdx: number) {
    if (sortCol === colIdx) setSortAsc(a => !a)
    else { setSortCol(colIdx); setSortAsc(true) }
  }

  const linhasOrdenadas = sortCol === null
    ? secao.linhas
    : [...secao.linhas].sort((a, b) => {
        const va = a[sortCol] ?? ''
        const vb = b[sortCol] ?? ''
        const num = (v: string) => parseFloat(v.replace(/[^\d.,\-]/g, '').replace(',', '.'))
        const na = num(va); const nb = num(vb)
        const cmp = !isNaN(na) && !isNaN(nb) ? na - nb : va.localeCompare(vb, 'pt-BR')
        return sortAsc ? cmp : -cmp
      })

  return (
    <div>
      <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant/60">{secao.titulo}</h4>
      <div className="overflow-x-auto rounded-xl border border-outline-variant/15">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-outline-variant/15 bg-surface-container-low/60">
              {secao.colunas.map((col, j) => (
                <th
                  key={j}
                  onClick={() => toggleSort(j)}
                  className="cursor-pointer select-none px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/70 hover:text-on-surface transition-colors whitespace-nowrap"
                >
                  <span className="flex items-center gap-1">
                    {col}
                    {sortCol === j ? (
                      <span className="material-symbols-outlined text-[12px] text-primary">
                        {sortAsc ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[12px] text-on-surface-variant/30">unfold_more</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhasOrdenadas.map((linha, j) => (
              <tr key={j} className="border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-low/30 transition-colors">
                {linha.map((cel, k) => (
                  <td key={k} className="px-4 py-2.5 text-on-surface/80 whitespace-nowrap">{cel}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {secao.linhas.length === 0 && (
          <p className="py-8 text-center text-[13px] text-on-surface-variant/50">Nenhum dado.</p>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-on-surface-variant/40">{secao.linhas.length} linha{secao.linhas.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ── Renderer principal ───────────────────────────────────────────────────────

export function RelatorioRenderer({ rel }: { rel: RelatorioJSON }) {
  const temTabela = rel.secoes.some(s => s.tipo === 'tabela')

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {rel.kpis && rel.kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rel.kpis.map((kpi, i) => (
            <KPICard key={i} {...kpi} />
          ))}
        </div>
      )}

      {/* Seções */}
      {rel.secoes.map((secao, i) => {
        if (secao.tipo === 'tabela') {
          return <TabelaSecao key={i} secao={secao} />
        }
        if (secao.tipo === 'texto') {
          return (
            <div key={i}>
              {secao.titulo && (
                <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant/60">{secao.titulo}</h4>
              )}
              <p className="text-[13px] leading-relaxed text-on-surface/80 whitespace-pre-line">{secao.conteudo}</p>
            </div>
          )
        }
        if (secao.tipo === 'lista') {
          return (
            <div key={i}>
              {secao.titulo && (
                <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-on-surface-variant/60">{secao.titulo}</h4>
              )}
              <ul className="space-y-1">
                {secao.itens.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-[13px] text-on-surface/80">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )
        }
        return null
      })}

      {!temTabela && rel.secoes.length === 0 && (
        <p className="text-[13px] text-on-surface-variant/50 italic">Relatório sem seções.</p>
      )}
    </div>
  )
}
