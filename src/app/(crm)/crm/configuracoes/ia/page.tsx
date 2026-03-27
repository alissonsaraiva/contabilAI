'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const INPUT  = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface font-mono shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 placeholder:font-sans'
const LABEL  = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const SELECT = `${INPUT} cursor-pointer`

// ─── Tipos de tools ───────────────────────────────────────────────────────────
type ToolCapacidade = {
  tool: string
  label: string
  descricao: string
  categoria: string
  canais: string[]
  habilitada: boolean
}

type Model = { value: string; label: string }
type ApiStatus = { configured: boolean; masked: string | null }
type ProviderModels = { models: Model[]; configured: boolean; dynamic: boolean }
type AllModels = { claude: ProviderModels; openai: ProviderModels; google: ProviderModels }
type TestResult = { ok: boolean; label?: string; error?: string }
type TestResults = { anthropic: TestResult; voyage: TestResult; groq: TestResult; openai: TestResult; google: TestResult }

type FormData = {
  nomeAssistenteOnboarding: string
  nomeAssistenteCrm: string
  nomeAssistentePortal: string
  nomeAssistenteWhatsapp: string
  anthropicApiKey: string
  voyageApiKey: string
  openaiApiKey: string
  openaiBaseUrl: string
  googleApiKey: string
  groqApiKey: string
  aiProviderOnboarding: string
  aiProviderCrm: string
  aiProviderPortal: string
  aiProviderWhatsapp: string
  aiProviderAgente: string
  aiModelOnboarding: string
  aiModelCrm: string
  aiModelPortal: string
  aiModelWhatsapp: string
  aiModelAgente: string
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

const FALLBACK_MODELS: AllModels = {
  claude: {
    configured: false,
    dynamic: false,
    models: [
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — rápido e econômico' },
      { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 — melhor custo-benefício' },
      { value: 'claude-opus-4-6',           label: 'Claude Opus 4.6 — mais capaz' },
    ],
  },
  openai: {
    configured: false,
    dynamic: false,
    models: [
      { value: 'gpt-4.1-nano',  label: 'GPT-4.1 Nano — ultra econômico' },
      { value: 'gpt-4.1-mini',  label: 'GPT-4.1 Mini — econômico' },
      { value: 'gpt-4.1',       label: 'GPT-4.1 — avançado' },
      { value: 'gpt-4o-mini',   label: 'GPT-4o Mini' },
      { value: 'gpt-4o',        label: 'GPT-4o' },
    ],
  },
  google: {
    configured: false,
    dynamic: false,
    models: [
      { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — ultra econômico' },
      { value: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash — rápido e econômico' },
      { value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash — equilibrado' },
      { value: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro — mais capaz' },
    ],
  },
}

const PROVIDERS = [
  { value: 'claude',  icon: '🟣', name: 'Claude',  desc: 'Anthropic' },
  { value: 'openai',  icon: '🟢', name: 'OpenAI',  desc: 'GPT / Groq...' },
  { value: 'google',  icon: '🔵', name: 'Gemini',  desc: 'Google' },
]

const SUB_IAS = [
  { providerField: 'aiProviderOnboarding' as const, modelField: 'aiModelOnboarding' as const, promptField: 'systemPromptOnboarding' as const, nameField: 'nomeAssistenteOnboarding' as const, label: 'Chat Onboarding',    icon: 'chat_bubble',   desc: 'Triagem de novos clientes', note: null },
  { providerField: 'aiProviderCrm'        as const, modelField: 'aiModelCrm'        as const, promptField: 'systemPromptCrm'        as const, nameField: 'nomeAssistenteCrm'        as const, label: 'Assistente CRM',   icon: 'support_agent', desc: 'Auxílio interno para o contador', note: null },
  { providerField: 'aiProviderPortal'     as const, modelField: 'aiModelPortal'     as const, promptField: 'systemPromptPortal'     as const, nameField: 'nomeAssistentePortal'     as const, label: 'Portal Cliente',   icon: 'person',        desc: 'Chat do cliente com o escritório', note: null },
  { providerField: 'aiProviderWhatsapp'   as const, modelField: 'aiModelWhatsapp'   as const, promptField: null,                              nameField: 'nomeAssistenteWhatsapp'   as const, label: 'IA WhatsApp',      icon: 'chat',          desc: 'Respostas automáticas via WhatsApp', note: null },
  { providerField: 'aiProviderAgente'     as const, modelField: 'aiModelAgente'     as const, promptField: null,                              nameField: null,                               label: 'Agente Operacional', icon: 'smart_toy',    desc: 'Executa tarefas e consultas no CRM', note: 'Requer suporte a tool use. Recomendado: Claude.' },
]

export default function ConfiguracoesIAPage() {
  const [tab, setTab]           = useState<'chaves' | 'funcionalidades' | 'ferramentas'>('chaves')
  const [loading, setLoading]     = useState(false)
  const [testing, setTesting]     = useState(false)
  const [testResults, setTestResults] = useState<TestResults | null>(null)
  const [status, setStatus]       = useState<Record<string, ApiStatus>>({})
  const [allModels, setAllModels] = useState<AllModels>(FALLBACK_MODELS)
  const [modelsLoading, setModelsLoading] = useState(false)

  // ── Estado de tools ──────────────────────────────────────────────────────
  const [tools, setTools]             = useState<ToolCapacidade[]>([])
  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolsSaving, setToolsSaving]   = useState(false)

  const { register, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      nomeAssistenteOnboarding: '',
      nomeAssistenteCrm:        '',
      nomeAssistentePortal:     '',
      nomeAssistenteWhatsapp:   '',
      aiProviderOnboarding: 'claude',
      aiProviderCrm:        'claude',
      aiProviderPortal:     'claude',
      aiProviderWhatsapp:   'claude',
      aiProviderAgente:     'claude',
      aiModelOnboarding:    'claude-haiku-4-5-20251001',
      aiModelCrm:           'claude-haiku-4-5-20251001',
      aiModelPortal:        'claude-haiku-4-5-20251001',
      aiModelWhatsapp:      'claude-haiku-4-5-20251001',
      aiModelAgente:        'claude-haiku-4-5-20251001',
    },
  })

  // Carrega config inicial
  useEffect(() => {
    fetch('/api/configuracoes/ia').then(r => r.json()).then(data => {
      reset({
        nomeAssistenteOnboarding: data.nomeAssistenteOnboarding ?? '',
        nomeAssistenteCrm:        data.nomeAssistenteCrm        ?? '',
        nomeAssistentePortal:     data.nomeAssistentePortal     ?? '',
        nomeAssistenteWhatsapp:   data.nomeAssistenteWhatsapp   ?? '',
        anthropicApiKey:       '',
        voyageApiKey:          '',
        openaiApiKey:          '',
        openaiBaseUrl:         data.openaiBaseUrl   ?? '',
        googleApiKey:          '',
        groqApiKey:            '',
        aiProviderOnboarding:  data.aiProviderOnboarding ?? 'claude',
        aiProviderCrm:         data.aiProviderCrm        ?? 'claude',
        aiProviderPortal:      data.aiProviderPortal     ?? 'claude',
        aiProviderWhatsapp:    data.aiProviderWhatsapp   ?? 'claude',
        aiProviderAgente:      data.aiProviderAgente     ?? 'claude',
        aiModelOnboarding:     data.aiModelOnboarding    ?? 'claude-haiku-4-5-20251001',
        aiModelCrm:            data.aiModelCrm           ?? 'claude-haiku-4-5-20251001',
        aiModelPortal:         data.aiModelPortal        ?? 'claude-haiku-4-5-20251001',
        aiModelWhatsapp:       data.aiModelWhatsapp      ?? 'claude-haiku-4-5-20251001',
        aiModelAgente:         data.aiModelAgente        ?? 'claude-haiku-4-5-20251001',
        systemPromptOnboarding: data.systemPromptOnboarding ?? '',
        systemPromptCrm:        data.systemPromptCrm        ?? '',
        systemPromptPortal:     data.systemPromptPortal     ?? '',
      })
      setStatus({
        anthropicApiKey: { configured: !!data.anthropicApiKeyConfigured, masked: data.anthropicApiKey },
        voyageApiKey:    { configured: !!data.voyageApiKeyConfigured,    masked: data.voyageApiKey },
        openaiApiKey:    { configured: !!data.openaiApiKeyConfigured,    masked: data.openaiApiKey },
        googleApiKey:    { configured: !!data.googleApiKeyConfigured,    masked: data.googleApiKey },
        groqApiKey:      { configured: !!data.groqApiKeyConfigured,      masked: data.groqApiKey },
      })
    })
  }, [reset])

  // Busca modelos de todos os providers
  function loadModels() {
    setModelsLoading(true)
    fetch('/api/configuracoes/ia/models')
      .then(r => r.json())
      .then((data: AllModels) => {
        setAllModels({
          claude: data.claude ?? FALLBACK_MODELS.claude,
          openai: data.openai ?? FALLBACK_MODELS.openai,
          google: data.google ?? FALLBACK_MODELS.google,
        })
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false))
  }

  useEffect(() => { loadModels() }, [])

  const loadTools = useCallback(() => {
    setToolsLoading(true)
    fetch('/api/agente/tools')
      .then(r => r.json())
      .then((data: { capacidades: ToolCapacidade[] }) => setTools(data.capacidades ?? []))
      .catch(() => {})
      .finally(() => setToolsLoading(false))
  }, [])

  useEffect(() => { loadTools() }, [loadTools])

  function toggleTool(toolName: string) {
    setTools(prev => prev.map(t => t.tool === toolName ? { ...t, habilitada: !t.habilitada } : t))
  }

  async function saveTools() {
    setToolsSaving(true)
    try {
      const desabilitadas = tools.filter(t => !t.habilitada).map(t => t.tool)
      const res = await fetch('/api/agente/tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desabilitadas }),
      })
      if (!res.ok) throw new Error()
      toast.success('Ferramentas do agente salvas!')
    } catch {
      toast.error('Erro ao salvar ferramentas')
    } finally {
      setToolsSaving(false)
    }
  }

  async function onSubmitKeys(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/configuracoes/ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: data.anthropicApiKey,
          voyageApiKey:    data.voyageApiKey,
          openaiApiKey:    data.openaiApiKey,
          openaiBaseUrl:   data.openaiBaseUrl,
          googleApiKey:    data.googleApiKey,
          groqApiKey:      data.groqApiKey,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Chaves de API salvas!')
      const updated = await fetch('/api/configuracoes/ia').then(r => r.json())
      setStatus({
        anthropicApiKey: { configured: !!updated.anthropicApiKeyConfigured, masked: updated.anthropicApiKey },
        voyageApiKey:    { configured: !!updated.voyageApiKeyConfigured,    masked: updated.voyageApiKey },
        openaiApiKey:    { configured: !!updated.openaiApiKeyConfigured,    masked: updated.openaiApiKey },
        googleApiKey:    { configured: !!updated.googleApiKeyConfigured,    masked: updated.googleApiKey },
        groqApiKey:      { configured: !!updated.groqApiKeyConfigured,      masked: updated.groqApiKey },
      })
      // Reset key fields
      setValue('anthropicApiKey', '')
      setValue('voyageApiKey', '')
      setValue('openaiApiKey', '')
      setValue('googleApiKey', '')
      setValue('groqApiKey', '')
      // Reload models with new keys
      loadModels()
    } catch {
      toast.error('Erro ao salvar chaves')
    } finally {
      setLoading(false)
    }
  }

  async function onSubmitFeatures(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/configuracoes/ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeAssistenteOnboarding: data.nomeAssistenteOnboarding || null,
          nomeAssistenteCrm:        data.nomeAssistenteCrm        || null,
          nomeAssistentePortal:     data.nomeAssistentePortal     || null,
          nomeAssistenteWhatsapp:   data.nomeAssistenteWhatsapp   || null,
          aiProviderOnboarding:  data.aiProviderOnboarding,
          aiProviderCrm:         data.aiProviderCrm,
          aiProviderPortal:      data.aiProviderPortal,
          aiProviderWhatsapp:    data.aiProviderWhatsapp,
          aiProviderAgente:      data.aiProviderAgente,
          aiModelOnboarding:     data.aiModelOnboarding,
          aiModelCrm:            data.aiModelCrm,
          aiModelPortal:         data.aiModelPortal,
          aiModelWhatsapp:       data.aiModelWhatsapp,
          aiModelAgente:         data.aiModelAgente,
          systemPromptOnboarding: data.systemPromptOnboarding,
          systemPromptCrm:        data.systemPromptCrm,
          systemPromptPortal:     data.systemPromptPortal,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Configurações por funcionalidade salvas!')
    } catch {
      toast.error('Erro ao salvar configurações')
    } finally {
      setLoading(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResults(null)
    try {
      const res = await fetch('/api/configuracoes/ia', { method: 'POST' })
      const data = await res.json() as TestResults
      setTestResults(data)
    } catch {
      toast.error('Erro ao testar conexões')
    } finally {
      setTesting(false)
    }
  }

  const watchedProviders = {
    aiProviderOnboarding: watch('aiProviderOnboarding'),
    aiProviderCrm:        watch('aiProviderCrm'),
    aiProviderPortal:     watch('aiProviderPortal'),
    aiProviderWhatsapp:   watch('aiProviderWhatsapp'),
    aiProviderAgente:     watch('aiProviderAgente'),
  }

  return (
    <div className="space-y-5">

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-container-low/60 p-1 border border-outline-variant/15">
        {([
          { key: 'chaves',          label: 'Chaves de API',       icon: 'key' },
          { key: 'funcionalidades', label: 'Por Funcionalidade',  icon: 'tune' },
          { key: 'ferramentas',     label: 'Ferramentas',         icon: 'build' },
        ] as const).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 flex-1 justify-center rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-all',
              tab === t.key
                ? 'bg-card text-primary shadow-sm border border-outline-variant/15'
                : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: tab === t.key ? "'FILL' 1" : "'FILL' 0" }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Chaves de API ── */}
      {tab === 'chaves' && (
        <>
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

              <div className="space-y-1.5 rounded-xl border border-outline-variant/10 bg-surface-container-low/50 p-4">
                <label className={LABEL}>Base URL (OpenAI-compatible)</label>
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

              <KeyField label="Google API Key" description="Necessária para usar Gemini"
                placeholder="AIza..." fieldName="googleApiKey"
                status={status.googleApiKey} register={register} />

              <KeyField label="Groq API Key" description="Transcrição de áudio via Whisper (gratuito) — obtenha em console.groq.com"
                placeholder="gsk_..." fieldName="groqApiKey"
                status={status.groqApiKey} register={register} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
            <button
              type="button" onClick={handleTest} disabled={testing}
              className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">electrical_services</span>}
              {testing ? 'Testando...' : 'Testar conexões'}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button" onClick={() => reset()} disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[16px]">undo</span>
                Cancelar
              </button>
              <button
                type="button" onClick={handleSubmit(onSubmitKeys)} disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 min-w-[140px] justify-center"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
                Salvar
              </button>
            </div>
          </div>

            {/* Resultados dos testes */}
            {testResults && (
              <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/50 divide-y divide-outline-variant/10">
                {([
                  { key: 'anthropic', icon: '🟣', name: 'Anthropic (Claude)' },
                  { key: 'voyage',    icon: '🔷', name: 'Voyage AI (RAG)' },
                  { key: 'groq',      icon: '⚡', name: 'Groq (Whisper)' },
                  { key: 'openai',    icon: '🟢', name: 'OpenAI / Compatible' },
                  { key: 'google',    icon: '🔵', name: 'Google (Gemini)' },
                ] as const).map(({ key, icon, name }) => {
                  const r = testResults[key]
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
            )}
          </div>
        </>
      )}

      {/* ── Tab: Ferramentas do Agente ── */}
      {tab === 'ferramentas' && (
        <>
          <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-on-surface">Ferramentas do Agente Operacional</h3>
                  <p className="text-[12px] text-on-surface-variant/80">Desabilite ferramentas que não deseja que o agente use. Afeta todos os canais.</p>
                </div>
              </div>
              {toolsLoading && <Loader2 className="h-4 w-4 animate-spin text-on-surface-variant/40" />}
            </div>

            {tools.length === 0 && !toolsLoading && (
              <p className="text-[13px] text-on-surface-variant/60 text-center py-8">Nenhuma ferramenta encontrada.</p>
            )}

            {tools.length > 0 && (() => {
              // Agrupa por categoria
              const categorias = [...new Set(tools.map(t => t.categoria))]
              return (
                <div className="space-y-5">
                  {categorias.map(categoria => (
                    <div key={categoria}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50 mb-2 px-1">{categoria}</p>
                      <div className="divide-y divide-outline-variant/10 rounded-xl border border-outline-variant/15 overflow-hidden">
                        {tools.filter(t => t.categoria === categoria).map(tool => (
                          <div key={tool.tool} className="flex items-center justify-between gap-4 px-4 py-3 bg-surface-container-low/30 hover:bg-surface-container-low/60 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-on-surface">{tool.label}</span>
                                <div className="flex gap-1">
                                  {tool.canais.map(canal => (
                                    <span key={canal} className="rounded-full border border-outline-variant/20 bg-card px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant/60">{canal}</span>
                                  ))}
                                </div>
                              </div>
                              <p className="text-[11px] text-on-surface-variant/60 mt-0.5 truncate">{tool.descricao}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleTool(tool.tool)}
                              className={cn(
                                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                                tool.habilitada ? 'bg-primary' : 'bg-outline-variant/40',
                              )}
                              aria-label={tool.habilitada ? 'Desabilitar' : 'Habilitar'}
                            >
                              <span className={cn(
                                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                                tool.habilitada ? 'translate-x-4' : 'translate-x-0',
                              )} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[12px] text-on-surface-variant/60">
              {tools.filter(t => !t.habilitada).length > 0
                ? `${tools.filter(t => !t.habilitada).length} ferramenta(s) desabilitada(s)`
                : 'Todas as ferramentas habilitadas'}
            </p>
            <button
              type="button" onClick={saveTools} disabled={toolsSaving}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 min-w-[140px] justify-center"
            >
              {toolsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
              Salvar
            </button>
          </div>
        </>
      )}

      {/* ── Tab: Por Funcionalidade ── */}
      {tab === 'funcionalidades' && (
        <>
          {modelsLoading && (
            <div className="flex items-center gap-2 text-[12px] text-on-surface-variant/60">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando modelos disponíveis...
            </div>
          )}

          <div className="space-y-4">
            {SUB_IAS.map(({ providerField, modelField, promptField, nameField, label, icon, desc, note }) => {
              const selectedProvider = watchedProviders[providerField] as 'claude' | 'openai' | 'google'
              const providerData = allModels[selectedProvider] ?? allModels.claude
              const models = providerData.models

              return (
                <div key={providerField} className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                      <span className="material-symbols-outlined text-[16px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-on-surface">{label}</h3>
                      <p className="text-[11px] text-on-surface-variant/80">{desc}</p>
                    </div>
                  </div>

                  {/* Provider selection */}
                  <div className="mb-4">
                    <p className="text-[12px] font-semibold text-on-surface-variant mb-2">Provider</p>
                    <div className="flex gap-2">
                      {PROVIDERS.map(opt => {
                        const pData = allModels[opt.value as 'claude' | 'openai' | 'google']
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
                              {...register(providerField)}
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
                      {...register(modelField)}
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

                  {/* Nome da IA (identidade desta assistente) */}
                  {nameField && (
                    <div className="mb-4">
                      <label className="text-[12px] font-semibold text-on-surface-variant mb-1.5 block">Nome da IA</label>
                      <input
                        {...register(nameField)}
                        type="text"
                        placeholder="Ex: Clara, Sofia, Ana... (deixe em branco para omitir)"
                        className={INPUT}
                      />
                    </div>
                  )}

                  {/* System prompt (not for WhatsApp — managed in WhatsApp page) */}
                  {promptField && (
                    <div>
                      <label className="text-[12px] font-semibold text-on-surface-variant mb-1.5 block">System Prompt</label>
                      <textarea
                        {...register(promptField)}
                        rows={4}
                        className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 resize-y min-h-[96px]"
                        placeholder="Deixe em branco para usar o prompt padrão"
                      />
                    </div>
                  )}
                  {!promptField && !note && (
                    <p className="text-[11px] text-on-surface-variant/60 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">info</span>
                      O system prompt do WhatsApp é configurado na aba WhatsApp
                    </p>
                  )}
                  {note && (
                    <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1">
                      <span className="material-symbols-outlined text-[13px]">warning</span>
                      {note}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button" onClick={() => reset()} disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[16px]">undo</span>
              Cancelar
            </button>
            <button
              type="button" onClick={handleSubmit(onSubmitFeatures)} disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 min-w-[140px] justify-center"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
              Salvar
            </button>
          </div>
        </>
      )}
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
