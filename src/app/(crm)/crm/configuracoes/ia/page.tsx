'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const INPUT  = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface font-mono shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 placeholder:font-sans'
const LABEL  = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = `${INPUT} cursor-pointer`

type Model = { value: string; label: string }
type ApiStatus = { configured: boolean; masked: string | null }

type FormData = {
  aiProvider: string
  anthropicApiKey: string
  voyageApiKey: string
  openaiApiKey: string
  openaiBaseUrl: string
  openaiModel: string
  googleApiKey: string
  aiModelOnboarding: string
  aiModelCrm: string
  aiModelPortal: string
  systemPromptOnboarding: string
  systemPromptCrm: string
  systemPromptPortal: string
}

const OPENAI_PRESETS = [
  { label: 'OpenAI',      baseUrl: 'https://api.openai.com/v1' },
  { label: 'Groq',        baseUrl: 'https://api.groq.com/openai/v1' },
  { label: 'DeepSeek',    baseUrl: 'https://api.deepseek.com/v1' },
  { label: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  { label: 'Mistral',     baseUrl: 'https://api.mistral.ai/v1' },
]

const FALLBACK_MODELS: Record<string, Model[]> = {
  claude: [
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — rápido e econômico' },
    { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 — melhor custo-benefício' },
    { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6 — mais capaz' },
  ],
  openai: [
    { value: 'gpt-4.1-nano',  label: 'GPT-4.1 Nano — ultra econômico' },
    { value: 'gpt-4.1-mini',  label: 'GPT-4.1 Mini — econômico' },
    { value: 'gpt-4.1',       label: 'GPT-4.1 — avançado' },
    { value: 'gpt-4o-mini',   label: 'GPT-4o Mini' },
    { value: 'gpt-4o',        label: 'GPT-4o' },
  ],
  google: [
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — ultra econômico' },
    { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash — rápido e econômico' },
    { value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash — equilibrado' },
    { value: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro — mais capaz' },
  ],
}

export default function ConfiguracoesIAPage() {
  const [loading, setLoading]   = useState(false)
  const [testing, setTesting]   = useState(false)
  const [status, setStatus]     = useState<Record<string, ApiStatus>>({})
  const [models, setModels]     = useState<Model[]>(FALLBACK_MODELS.claude)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsDynamic, setModelsDynamic] = useState(false)

  const { register, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      aiProvider: 'claude',
      aiModelOnboarding: 'claude-haiku-4-5-20251001',
      aiModelCrm: 'claude-haiku-4-5-20251001',
      aiModelPortal: 'claude-haiku-4-5-20251001',
    },
  })

  const provider = watch('aiProvider')

  // Carrega config inicial
  useEffect(() => {
    fetch('/api/configuracoes/ia').then(r => r.json()).then(data => {
      reset({
        aiProvider:             data.aiProvider      ?? 'claude',
        anthropicApiKey:        '',
        voyageApiKey:           '',
        openaiApiKey:           '',
        openaiBaseUrl:          data.openaiBaseUrl   ?? '',
        openaiModel:            data.openaiModel     ?? '',
        googleApiKey:           '',
        aiModelOnboarding:      data.aiModelOnboarding ?? 'claude-haiku-4-5-20251001',
        aiModelCrm:             data.aiModelCrm        ?? 'claude-haiku-4-5-20251001',
        aiModelPortal:          data.aiModelPortal     ?? 'claude-haiku-4-5-20251001',
        systemPromptOnboarding: data.systemPromptOnboarding ?? '',
        systemPromptCrm:        data.systemPromptCrm        ?? '',
        systemPromptPortal:     data.systemPromptPortal     ?? '',
      })
      setStatus({
        anthropicApiKey: { configured: !!data.anthropicApiKeyConfigured, masked: data.anthropicApiKey },
        voyageApiKey:    { configured: !!data.voyageApiKeyConfigured,    masked: data.voyageApiKey },
        openaiApiKey:    { configured: !!data.openaiApiKeyConfigured,    masked: data.openaiApiKey },
        googleApiKey:    { configured: !!data.googleApiKeyConfigured,    masked: data.googleApiKey },
      })
    })
  }, [reset])

  // Busca modelos ao trocar de provider
  useEffect(() => {
    setModels(FALLBACK_MODELS[provider] ?? [])
    setModelsDynamic(false)
    if (!provider) return

    setModelsLoading(true)
    fetch('/api/configuracoes/ia/models')
      .then(r => r.json())
      .then(data => {
        if (data.models?.length) {
          setModels(data.models)
          setModelsDynamic(data.dynamic ?? false)
        }
      })
      .catch(() => {}) // mantém fallback
      .finally(() => setModelsLoading(false))
  }, [provider])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/configuracoes/ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      toast.success('Configurações de IA salvas!')
      const updated = await fetch('/api/configuracoes/ia').then(r => r.json())
      setStatus({
        anthropicApiKey: { configured: !!updated.anthropicApiKeyConfigured, masked: updated.anthropicApiKey },
        voyageApiKey:    { configured: !!updated.voyageApiKeyConfigured,    masked: updated.voyageApiKey },
        openaiApiKey:    { configured: !!updated.openaiApiKeyConfigured,    masked: updated.openaiApiKey },
        googleApiKey:    { configured: !!updated.googleApiKeyConfigured,    masked: updated.googleApiKey },
      })
      // Rebusca modelos com a nova chave
      fetch('/api/configuracoes/ia/models').then(r => r.json()).then(d => {
        if (d.models?.length) { setModels(d.models); setModelsDynamic(d.dynamic ?? false) }
      }).catch(() => {})
    } catch {
      toast.error('Erro ao salvar configurações')
    } finally {
      setLoading(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/configuracoes/ia', { method: 'POST' })
      const data = await res.json()
      if (data.ok) toast.success(`Conexão OK — ${data.provider} / ${data.model}`)
      else toast.error(`Falha: ${data.error}`)
    } catch {
      toast.error('Erro ao testar conexão')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* Provider */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Provider de IA</h3>
            <p className="text-[12px] text-on-surface-variant/80">Escolha qual modelo de linguagem alimenta o sistema</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { value: 'claude',  icon: '🟣', name: 'Anthropic Claude', desc: 'Recomendado — melhor em português' },
            { value: 'openai',  icon: '🟢', name: 'OpenAI-compatible',  desc: 'OpenAI, Groq, DeepSeek, Mistral...' },
            { value: 'google',  icon: '🔵', name: 'Google Gemini',      desc: 'Gemini 2.0 Flash e Pro' },
          ].map(opt => (
            <label
              key={opt.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all',
                provider === opt.value
                  ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                  : 'border-outline-variant/20 hover:border-outline-variant/40 hover:bg-surface-container-low/50',
              )}
            >
              <input type="radio" value={opt.value} {...register('aiProvider')} className="mt-0.5 accent-primary" />
              <div>
                <p className="text-[13px] font-semibold text-on-surface">{opt.icon} {opt.name}</p>
                <p className="text-[11px] text-on-surface-variant/80 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Chaves de API */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>key</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Chaves de API</h3>
            <p className="text-[12px] text-on-surface-variant/80">Armazenadas com encriptação AES-256-GCM</p>
          </div>
        </div>

        <div className="space-y-5">
          <KeyField label="Anthropic API Key" description="Necessária para usar Claude"
            placeholder="sk-ant-api03-..." fieldName="anthropicApiKey"
            status={status.anthropicApiKey} register={register} />

          <KeyField label="Voyage AI Key" description="Embeddings para busca semântica (RAG)"
            placeholder="pa-..." fieldName="voyageApiKey"
            status={status.voyageApiKey} register={register} />

          <KeyField label="OpenAI / Compatible API Key" description="Para usar OpenAI, Groq, DeepSeek, etc."
            placeholder="sk-..." fieldName="openaiApiKey"
            status={status.openaiApiKey} register={register} />

          {provider === 'openai' && (
            <div className="space-y-4 rounded-xl border border-outline-variant/10 bg-surface-container-low/50 p-4">
              <div className="space-y-1.5">
                <label className={LABEL}>Base URL</label>
                <input {...register('openaiBaseUrl')} className={INPUT} placeholder="https://api.openai.com/v1" />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {OPENAI_PRESETS.map(p => (
                    <button key={p.baseUrl} type="button"
                      onClick={() => setValue('openaiBaseUrl', p.baseUrl)}
                      className="rounded-full border border-outline-variant/20 bg-card px-2.5 py-1 text-[11px] font-medium text-on-surface-variant hover:border-primary/30 hover:text-primary transition-colors">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <KeyField label="Google API Key" description="Necessária para usar Gemini"
            placeholder="AIza..." fieldName="googleApiKey"
            status={status.googleApiKey} register={register} />
        </div>
      </div>

      {/* Modelo por funcionalidade */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>tune</span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface">Modelo por funcionalidade</h3>
              <p className="text-[12px] text-on-surface-variant/80">Balanceie custo e qualidade por caso de uso</p>
            </div>
          </div>
          {modelsLoading && <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant/50" />}
          {!modelsLoading && modelsDynamic && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-green-status">
              <span className="material-symbols-outlined text-[13px]">sync</span>
              Modelos atualizados
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {([
            { field: 'aiModelOnboarding', label: 'Chat Onboarding',  icon: 'chat_bubble',   desc: 'Triagem de novos clientes' },
            { field: 'aiModelCrm',        label: 'Assistente CRM',   icon: 'support_agent', desc: 'Auxílio interno para o contador' },
            { field: 'aiModelPortal',     label: 'Portal Cliente',   icon: 'person',         desc: 'Chat do cliente com o escritório' },
          ] as const).map(({ field, label, icon, desc }) => (
            <div key={field} className="space-y-1.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-[15px] text-primary/70">{icon}</span>
                <label className="text-[13px] font-semibold text-on-surface-variant">{label}</label>
              </div>
              <p className="text-[11px] text-on-surface-variant/60 mb-2">{desc}</p>
              <select
                {...register(field)}
                className={SELECT}
                disabled={modelsLoading}
              >
                {models.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* System Prompts */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>edit_note</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">System Prompts</h3>
            <p className="text-[12px] text-on-surface-variant/80">Personalidade e instruções da IA por canal. Deixe em branco para usar o padrão.</p>
          </div>
        </div>

        <div className="space-y-5">
          {([
            { field: 'systemPromptOnboarding', label: 'Onboarding',        icon: 'chat_bubble',   placeholder: 'Você é o assistente de onboarding da ContabAI. Ajude novos clientes a entender os planos e iniciar o cadastro...' },
            { field: 'systemPromptCrm',        label: 'Assistente CRM',    icon: 'support_agent', placeholder: 'Você é o assistente interno da ContabAI. Ajude o contador a analisar informações de clientes e leads...' },
            { field: 'systemPromptPortal',     label: 'Portal do Cliente', icon: 'person',         placeholder: 'Você é o assistente do portal ContabAI. Ajude o cliente a entender suas obrigações fiscais e documentos...' },
          ] as const).map(({ field, label, icon, placeholder }) => (
            <div key={field}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="material-symbols-outlined text-[15px] text-primary/70">{icon}</span>
                <label className="text-[13px] font-semibold text-on-surface-variant">{label}</label>
              </div>
              <textarea
                {...register(field)}
                rows={4}
                className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 resize-y min-h-[96px]"
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button" onClick={handleTest} disabled={testing}
          className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">electrical_services</span>}
          Testar conexão
        </button>

        <button
          type="button" onClick={handleSubmit(onSubmit)} disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 min-w-[160px] justify-center"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar
        </button>
      </div>
    </div>
  )
}

// ─── Sub-componente: campo de chave secreta ───────────────────────────────────

function KeyField({
  label, description, placeholder, fieldName, status, register,
}: {
  label: string
  description: string
  placeholder: string
  fieldName: string
  status?: ApiStatus
  register: ReturnType<typeof useForm<FormData>>['register']
}) {
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className={LABEL}>{label}</label>
        {status?.configured && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-status">
            <span className="material-symbols-outlined text-[13px]">check_circle</span>
            Configurada
          </span>
        )}
      </div>
      {status?.configured && (
        <p className="font-mono text-[11px] text-on-surface-variant/60 mb-1">{status.masked}</p>
      )}
      <div className="relative">
        <input
          {...register(fieldName as keyof FormData)}
          type={show ? 'text' : 'password'}
          className={`${INPUT} pr-10`}
          placeholder={status?.configured ? 'Nova chave (deixe em branco para manter)' : placeholder}
          autoComplete="off"
        />
        <button
          type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">{show ? 'visibility_off' : 'visibility'}</span>
        </button>
      </div>
      <p className="text-[11px] text-on-surface-variant/60">{description}</p>
    </div>
  )
}
