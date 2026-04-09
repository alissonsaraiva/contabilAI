'use client'

import type { TestResults } from '../types'

const TEST_PROVIDERS = [
  { key: 'anthropic' as const, icon: '🟣', name: 'Anthropic (Claude)' },
  { key: 'voyage' as const, icon: '🔷', name: 'Voyage AI (RAG)' },
  { key: 'groq' as const, icon: '⚡', name: 'Groq (Whisper)' },
  { key: 'openai' as const, icon: '🟢', name: 'OpenAI / Compatible' },
  { key: 'google' as const, icon: '🔵', name: 'Google (Gemini)' },
]

export function TestResultsPanel({ results }: { results: TestResults }) {
  return (
    <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/50 divide-y divide-outline-variant/10">
      {TEST_PROVIDERS.map(({ key, icon, name }) => {
        const r = results[key]
        return (
          <div key={key} className="flex flex-col gap-0.5 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-on-surface">{icon} {name}</span>
              {r.ok ? (
                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-green-status">
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  {r.label}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-error">
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                  Falha
                </span>
              )}
            </div>
            {!r.ok && r.error && (
              <p className="text-[11px] text-error/70 break-all leading-relaxed pl-0.5">{r.error}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
