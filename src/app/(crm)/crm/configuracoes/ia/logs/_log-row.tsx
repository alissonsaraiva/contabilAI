'use client'

import { useState } from 'react'
import { FEATURE_LABELS } from '@/lib/ai/constants'

export type LogEntry = {
  id:            string
  tool:          string
  toolLabel:     string
  sucesso:       boolean
  duracaoMs:     number
  solicitanteAI: string
  usuarioNome:   string | null
  usuarioTipo:   string | null
  contexto:      string | null
  input:         unknown
  resultado:     unknown
  criadoEm:      string   // serialized Date
}

function formatMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function LogRow({ row }: { row: LogEntry }) {
  const [expandInput,    setExpandInput]    = useState(false)
  const [expandResult,   setExpandResult]   = useState(false)

  const res     = row.resultado as Record<string, unknown> | null
  const resumo  = typeof res?.resumo === 'string' ? res.resumo : ''
  const erro    = typeof res?.erro   === 'string' ? res.erro   : ''
  const preview = row.sucesso ? resumo : (erro || resumo || 'Falhou')

  const inputJson    = row.input    ? JSON.stringify(row.input,    null, 2) : null
  const resultadoJson = row.resultado ? JSON.stringify(row.resultado, null, 2) : null

  return (
    <tr className={`hover:bg-surface-container-high/50 transition-colors ${!row.sucesso ? 'bg-error/[0.03]' : ''}`}>

      {/* Tool */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${row.sucesso ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`}>
          <span className="material-symbols-outlined text-[13px]">build</span>
          {row.toolLabel}
        </span>
      </td>

      {/* Origem */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="rounded-md bg-surface-container-low px-2 py-0.5 text-xs font-medium text-on-surface-variant">
          {FEATURE_LABELS[row.solicitanteAI] ?? row.solicitanteAI}
        </span>
      </td>

      {/* Operador */}
      <td className="px-4 py-3 text-xs whitespace-nowrap">
        {row.usuarioNome ? (
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[13px] text-on-surface-variant">person</span>
            <span className="text-on-surface">{row.usuarioNome}</span>
            {row.usuarioTipo && (
              <span className="rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] text-on-surface-variant">{row.usuarioTipo}</span>
            )}
          </div>
        ) : (
          <span className="italic opacity-40">automático</span>
        )}
      </td>

      {/* Contexto */}
      <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
        {row.contexto ?? <span className="italic opacity-50">—</span>}
      </td>

      {/* Input */}
      <td className="px-4 py-3 max-w-[160px]">
        {inputJson ? (
          <button
            onClick={() => setExpandInput(v => !v)}
            className="group w-full text-left"
          >
            {expandInput ? (
              <pre className="font-mono text-[10px] text-on-surface-variant whitespace-pre-wrap break-all bg-surface-container rounded p-1.5 max-h-40 overflow-y-auto">
                {inputJson}
              </pre>
            ) : (
              <span className="flex items-center gap-1 font-mono text-[10px] text-on-surface-variant truncate group-hover:text-primary transition-colors">
                <span className="truncate">{JSON.stringify(row.input, null, 0)}</span>
                <span className="material-symbols-outlined text-[11px] shrink-0 opacity-40 group-hover:opacity-100">unfold_more</span>
              </span>
            )}
          </button>
        ) : (
          <span className="italic opacity-40 text-xs">—</span>
        )}
      </td>

      {/* Resultado */}
      <td className="px-4 py-3 max-w-xs">
        <button
          onClick={() => setExpandResult(v => !v)}
          className="group w-full text-left"
        >
          {expandResult ? (
            <div>
              {resultadoJson ? (
                <pre className="font-mono text-[10px] text-on-surface-variant whitespace-pre-wrap break-all bg-surface-container rounded p-1.5 max-h-48 overflow-y-auto">
                  {resultadoJson}
                </pre>
              ) : (
                <span className="text-xs italic opacity-40">—</span>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-1.5">
              {row.sucesso ? (
                <span className="material-symbols-outlined text-[14px] text-success mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              ) : (
                <span className="material-symbols-outlined text-[14px] text-error mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
              )}
              <span className={`text-xs line-clamp-2 group-hover:text-primary transition-colors ${!row.sucesso ? 'text-error' : 'text-on-surface'}`}>
                {preview || <span className="italic opacity-40">—</span>}
              </span>
              {resultadoJson && (
                <span className="material-symbols-outlined text-[11px] shrink-0 opacity-30 group-hover:opacity-100 mt-0.5">unfold_more</span>
              )}
            </div>
          )}
        </button>
      </td>

      {/* Duração */}
      <td className="px-4 py-3 text-xs text-on-surface-variant tabular-nums whitespace-nowrap">
        {formatMs(row.duracaoMs)}
      </td>

      {/* Data / Hora */}
      <td className="px-4 py-3 text-xs text-on-surface-variant tabular-nums whitespace-nowrap">
        {formatDateTime(row.criadoEm)}
      </td>
    </tr>
  )
}
