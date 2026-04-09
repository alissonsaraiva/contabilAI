'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FormData, ApiStatus, AllModels, SubIaConfig, TestResults } from './types'
import { INPUT, LABEL } from './styles'
import { KeyField } from './components/key-field'
import { FormActions } from './components/form-actions'
import { TestResultsPanel } from './components/test-results'
import { SubIaCard } from './components/sub-ia-card'

const OPENAI_PRESETS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { label: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
]

const FALLBACK_MODELS: AllModels = {
  claude: {
    configured: false, dynamic: false,
    models: [
      { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — rápido e econômico' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — melhor custo-benefício' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 — mais capaz' },
    ],
  },
  openai: {
    configured: false, dynamic: false,
    models: [
      { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano — ultra econômico' },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini — econômico' },
      { value: 'gpt-4.1', label: 'GPT-4.1 — avançado' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
    ],
  },
  google: {
    configured: false, dynamic: false,
    models: [
      { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — ultra econômico' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — rápido e econômico' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — equilibrado' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — mais capaz' },
    ],
  },
}

const SUB_IAS: SubIaConfig[] = [
  { providerField: 'aiProviderOnboarding', modelField: 'aiModelOnboarding', promptField: 'systemPromptOnboarding', nameField: 'nomeAssistenteOnboarding', label: 'Chat Onboarding', icon: 'chat_bubble', desc: 'Triagem de novos clientes', note: null },
  { providerField: 'aiProviderCrm', modelField: 'aiModelCrm', promptField: 'systemPromptCrm', nameField: 'nomeAssistenteCrm', label: 'Assistente CRM', icon: 'support_agent', desc: 'Auxílio interno para o contador', note: null },
  { providerField: 'aiProviderPortal', modelField: 'aiModelPortal', promptField: 'systemPromptPortal', nameField: 'nomeAssistentePortal', label: 'Portal Cliente', icon: 'person', desc: 'Chat do cliente com o escritório', note: null },
  { providerField: 'aiProviderWhatsapp', modelField: 'aiModelWhatsapp', promptField: null, nameField: 'nomeAssistenteWhatsapp', label: 'IA WhatsApp', icon: 'chat', desc: 'Respostas automáticas via WhatsApp', note: null },
  { providerField: 'aiProviderAgente', modelField: 'aiModelAgente', promptField: null, nameField: null, label: 'Agente Operacional', icon: 'smart_toy', desc: 'Executa tarefas e consultas no CRM', note: 'Requer suporte a tool use. Recomendado: Claude.' },
  { providerField: 'aiProviderDocumentoResumo', modelField: 'aiModelDocumentoResumo', promptField: null, nameField: null, label: 'Resumo de Documentos', icon: 'description', desc: 'Classifica e resume documentos recebidos (todos os canais)', note: 'Recomendado: modelo econômico como Claude Haiku ou Gemini Flash.' },
]

const API_KEY_FIELDS = ['anthropicApiKey', 'voyageApiKey', 'openaiApiKey', 'googleApiKey', 'groqApiKey'] as const

export default function ConfiguracoesIAPage() {
  const [tab, setTab] = useState<'chaves' | 'funcionalidades'>('chaves')
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResults | null>(null)
  const [status, setStatus] = useState<Record<string, ApiStatus>>({})
  const [allModels, setAllModels] = useState<AllModels>(FALLBACK_MODELS)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SUB_IAS.map(ia => [ia.providerField, true]))
  )
  const toggleCollapse = useCallback((key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] })), [])

  const { register, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      nomeAssistenteOnboarding: '', nomeAssistenteCrm: '', nomeAssistentePortal: '', nomeAssistenteWhatsapp: '',
      aiProviderOnboarding: 'claude', aiProviderCrm: 'claude', aiProviderPortal: 'claude',
      aiProviderWhatsapp: 'claude', aiProviderAgente: 'claude', aiProviderDocumentoResumo: 'claude',
      aiModelOnboarding: 'claude-haiku-4-5-20251001', aiModelCrm: 'claude-haiku-4-5-20251001',
      aiModelPortal: 'claude-haiku-4-5-20251001', aiModelWhatsapp: 'claude-haiku-4-5-20251001',
      aiModelAgente: 'claude-haiku-4-5-20251001', aiModelDocumentoResumo: 'claude-haiku-4-5-20251001',
    },
  })

  useEffect(() => {
    fetch('/api/configuracoes/ia')
      .then(r => r.json())
      .then(data => {
        reset({
          nomeAssistenteOnboarding: data.nomeAssistenteOnboarding ?? '',
          nomeAssistenteCrm: data.nomeAssistenteCrm ?? '',
          nomeAssistentePortal: data.nomeAssistentePortal ?? '',
          nomeAssistenteWhatsapp: data.nomeAssistenteWhatsapp ?? '',
          anthropicApiKey: '', voyageApiKey: '', openaiApiKey: '', googleApiKey: '', groqApiKey: '',
          openaiBaseUrl: data.openaiBaseUrl ?? '',
          aiProviderOnboarding: data.aiProviderOnboarding ?? 'claude',
          aiProviderCrm: data.aiProviderCrm ?? 'claude',
          aiProviderPortal: data.aiProviderPortal ?? 'claude',
          aiProviderWhatsapp: data.aiProviderWhatsapp ?? 'claude',
          aiProviderAgente: data.aiProviderAgente ?? 'claude',
          aiProviderDocumentoResumo: data.aiProviderDocumentoResumo ?? 'claude',
          aiModelOnboarding: data.aiModelOnboarding ?? 'claude-haiku-4-5-20251001',
          aiModelCrm: data.aiModelCrm ?? 'claude-haiku-4-5-20251001',
          aiModelPortal: data.aiModelPortal ?? 'claude-haiku-4-5-20251001',
          aiModelWhatsapp: data.aiModelWhatsapp ?? 'claude-haiku-4-5-20251001',
          aiModelAgente: data.aiModelAgente ?? 'claude-haiku-4-5-20251001',
          aiModelDocumentoResumo: data.aiModelDocumentoResumo ?? 'claude-haiku-4-5-20251001',
          systemPromptOnboarding: data.systemPromptOnboarding ?? '',
          systemPromptCrm: data.systemPromptCrm ?? '',
          systemPromptPortal: data.systemPromptPortal ?? '',
        })
        setStatus(Object.fromEntries(
          API_KEY_FIELDS.map(k => [k, { configured: !!data[`${k}Configured`], masked: data[k] }])
        ))
      })
      .catch((err: unknown) => {
        console.error('[configuracoes/ia] erro ao carregar configurações:', err)
        toast.error('Erro ao carregar configurações de IA')
      })
  }, [reset])

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
      .catch((err: unknown) => {
        console.warn('[configuracoes/ia] erro ao carregar modelos, usando fallback:', err)
      })
      .finally(() => setModelsLoading(false))
  }

  useEffect(() => { loadModels() }, [])

  async function onSubmitKeys(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/configuracoes/ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: data.anthropicApiKey, voyageApiKey: data.voyageApiKey,
          openaiApiKey: data.openaiApiKey, openaiBaseUrl: data.openaiBaseUrl,
          googleApiKey: data.googleApiKey, groqApiKey: data.groqApiKey,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Chaves de API salvas!')
      const updated = await fetch('/api/configuracoes/ia').then(r => r.json())
      setStatus(Object.fromEntries(
        API_KEY_FIELDS.map(k => [k, { configured: !!updated[`${k}Configured`], masked: updated[k] }])
      ))
      API_KEY_FIELDS.forEach(k => setValue(k, ''))
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
      const payload: Record<string, string | null> = {}
      SUB_IAS.forEach(ia => {
        payload[ia.providerField] = data[ia.providerField]
        payload[ia.modelField] = data[ia.modelField]
        if (ia.nameField) payload[ia.nameField] = data[ia.nameField] || null
        if (ia.promptField) payload[ia.promptField] = data[ia.promptField]
      })
      const res = await fetch('/api/configuracoes/ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-surface-container-low/60 p-1 border border-outline-variant/15">
        {([
          { key: 'chaves', label: 'Chaves de API', icon: 'key' },
          { key: 'funcionalidades', label: 'Por Funcionalidade', icon: 'tune' },
        ] as const).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-2 flex-1 justify-center rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all',
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

      {/* Tab: Chaves de API */}
      {tab === 'chaves' && (
        <>
          <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card p-4 md:p-6 shadow-sm">
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
            <div className="flex flex-col-reverse md:flex-row md:items-center justify-end gap-4 mt-6">
              <button
                type="button" onClick={handleTest} disabled={testing}
                className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl border border-outline-variant/30 bg-card px-5 py-2.5 text-[13px] font-semibold text-on-surface shadow-sm hover:bg-surface-container-low transition-colors disabled:opacity-60"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">electrical_services</span>}
                {testing ? 'Testando...' : 'Testar conexões'}
              </button>
              <FormActions onCancel={() => reset()} onSubmit={handleSubmit(onSubmitKeys)} loading={loading} />
            </div>
            {testResults && <TestResultsPanel results={testResults} />}
          </div>
        </>
      )}

      {/* Tab: Por Funcionalidade */}
      {tab === 'funcionalidades' && (
        <>
          {modelsLoading && (
            <div className="flex items-center gap-2 text-[12px] text-on-surface-variant/60">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando modelos disponíveis...
            </div>
          )}

          <div className="space-y-4">
            {SUB_IAS.map(ia => (
              <SubIaCard
                key={ia.providerField}
                ia={ia}
                allModels={allModels}
                modelsLoading={modelsLoading}
                collapsed={!!collapsed[ia.providerField]}
                onToggle={() => toggleCollapse(ia.providerField)}
                register={register}
                watch={watch}
              />
            ))}
          </div>

          <div className="flex flex-col-reverse md:flex-row md:items-center justify-end gap-3 mt-4 pt-4 border-t border-outline-variant/15">
            <FormActions onCancel={() => reset()} onSubmit={handleSubmit(onSubmitFeatures)} loading={loading} />
          </div>
        </>
      )}
    </div>
  )
}
