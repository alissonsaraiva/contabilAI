'use client'

import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UseFormRegister, UseFormWatch } from 'react-hook-form'
import type { FormData, AllModels, ProviderKey, SubIaConfig } from '../types'
import { INPUT, SELECT } from '../styles'

const PROVIDERS = [
  { value: 'claude' as const, icon: '🟣', name: 'Claude', desc: 'Anthropic' },
  { value: 'openai' as const, icon: '🟢', name: 'OpenAI', desc: 'GPT / Groq...' },
  { value: 'google' as const, icon: '🔵', name: 'Gemini', desc: 'Google' },
]

export function SubIaCard({
  ia, allModels, modelsLoading, collapsed, onToggle, register, watch,
}: {
  ia: SubIaConfig
  allModels: AllModels
  modelsLoading: boolean
  collapsed: boolean
  onToggle: () => void
  register: UseFormRegister<FormData>
  watch: UseFormWatch<FormData>
}) {
  const selectedProvider = watch(ia.providerField) as ProviderKey
  const providerData = allModels[selectedProvider] ?? allModels.claude
  const models = providerData.models

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-5 text-left hover:bg-surface-container-low/40 transition-colors"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>{ia.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[13px] font-semibold text-on-surface">{ia.label}</h3>
          <p className="text-[11px] text-on-surface-variant/80">{ia.desc}</p>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-on-surface-variant/50 shrink-0 transition-transform duration-200', collapsed ? '' : 'rotate-180')}
        />
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div className="px-5 pb-5 pt-1">
          {/* Provider selection */}
          <div className="mb-4">
            <p className="text-[12px] font-semibold text-on-surface-variant mb-2">Provider</p>
            <div className="flex gap-2">
              {PROVIDERS.map(opt => {
                const pData = allModels[opt.value]
                const available = pData?.configured ?? false
                const selected = selectedProvider === opt.value
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      'relative flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 transition-all flex-1',
                      !available && 'cursor-not-allowed opacity-50',
                      selected && available
                        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                        : 'border-outline-variant/20 hover:border-outline-variant/40',
                    )}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      {...register(ia.providerField)}
                      disabled={!available}
                      className="sr-only"
                    />
                    <span className="text-[13px]">{opt.icon} <span className="font-semibold text-on-surface">{opt.name}</span></span>
                    <span className="text-[10px] text-on-surface-variant/70">
                      {available ? opt.desc : 'Chave não configurada'}
                    </span>
                    {!available && (
                      <span className="absolute right-2 top-2 material-symbols-outlined text-[12px] text-on-surface-variant/40">lock</span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Model selection */}
          <div className="mb-4">
            <label className="text-[12px] font-semibold text-on-surface-variant mb-1.5 block">Modelo</label>
            <select
              {...register(ia.modelField)}
              className={SELECT}
              disabled={modelsLoading}
            >
              {models.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            {providerData.dynamic && (
              <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">sync</span>
                Modelos atualizados via API
              </p>
            )}
          </div>

          {/* IA name */}
          {ia.nameField && (
            <div className="mb-4">
              <label className="text-[12px] font-semibold text-on-surface-variant mb-1.5 block">Nome da IA</label>
              <input
                {...register(ia.nameField)}
                type="text"
                placeholder="Ex: Clara, Sofia, Ana... (deixe em branco para omitir)"
                className={INPUT}
              />
            </div>
          )}

          {/* System prompt */}
          {ia.promptField && (
            <div>
              <label className="text-[12px] font-semibold text-on-surface-variant mb-1.5 block">System Prompt</label>
              <textarea
                {...register(ia.promptField)}
                rows={4}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 resize-y min-h-[96px]"
                placeholder="Deixe em branco para usar o prompt padrão"
              />
            </div>
          )}
          {!ia.promptField && !ia.note && (
            <p className="text-[11px] text-on-surface-variant/60 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">info</span>
              O system prompt do WhatsApp é configurado na aba WhatsApp
            </p>
          )}
          {ia.note && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-[13px]">warning</span>
              {ia.note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
