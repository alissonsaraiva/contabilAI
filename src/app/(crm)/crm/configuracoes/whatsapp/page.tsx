'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

type FormData = {
  evolutionApiUrl: string
  evolutionApiKey: string
  evolutionInstance: string
  whatsappAiEnabled: boolean
  systemPromptWhatsapp: string
}

type ConnectionState = 'unknown' | 'open' | 'connecting' | 'close'

type StateResponse = {
  instance?: {
    instanceName?: string
    state?: string
  }
  state?: string
}

type ConnectResponse = {
  base64?: string
  qrcode?: { base64?: string }
}

export default function WhatsAppPage() {
  const [savingCfg, setSavingCfg] = useState(false)
  const [connState, setConnState] = useState<ConnectionState>('unknown')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState(false)
  const [loadingState, setLoadingState] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [webhookCopied, setWebhookCopied] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { register, handleSubmit, reset } = useForm<FormData>({
    defaultValues: { evolutionApiUrl: '', evolutionApiKey: '', evolutionInstance: '' },
  })

  // Carrega config salva
  useEffect(() => {
    fetch('/api/configuracoes/ia').then(r => r.json()).then(data => {
      reset({
        evolutionApiUrl:      data.evolutionApiUrl ?? '',
        evolutionApiKey:      '',
        evolutionInstance:    data.evolutionInstance ?? '',
        whatsappAiEnabled:    data.whatsappAiEnabled ?? false,
        systemPromptWhatsapp: data.systemPromptWhatsapp ?? '',
      })
    })
  }, [reset])

  const checkState = useCallback(async (silent = false) => {
    if (!silent) setLoadingState(true)
    try {
      const res = await fetch('/api/whatsapp/evolution?action=state')
      if (!res.ok) {
        setConnState('unknown')
        return
      }
      const data = await res.json() as StateResponse
      const state = (data?.instance?.state ?? data?.state ?? 'unknown').toLowerCase()
      const mapped: ConnectionState =
        state === 'open' ? 'open' :
        state.includes('connect') ? 'connecting' :
        state === 'close' ? 'close' : 'unknown'
      setConnState(mapped)
      if (mapped === 'open') {
        setQrCode(null)
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      }
    } catch {
      setConnState('unknown')
    } finally {
      if (!silent) setLoadingState(false)
    }
  }, [])

  useEffect(() => {
    checkState()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [checkState])

  // Polling quando exibindo QR
  useEffect(() => {
    if (qrCode) {
      pollRef.current = setInterval(() => checkState(true), 5000)
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [qrCode, checkState])

  async function onSaveConfig(data: FormData) {
    setSavingCfg(true)
    try {
      const payload: Record<string, string | boolean> = {
        evolutionApiUrl:      data.evolutionApiUrl,
        evolutionInstance:    data.evolutionInstance,
        whatsappAiEnabled:    data.whatsappAiEnabled,
        whatsappAiFeature:    'whatsapp',
        systemPromptWhatsapp: data.systemPromptWhatsapp,
      }
      if (data.evolutionApiKey) payload.evolutionApiKey = data.evolutionApiKey

      const res = await fetch('/api/configuracoes/ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success('Configurações salvas')
      reset({
        evolutionApiUrl:      data.evolutionApiUrl,
        evolutionApiKey:      '',
        evolutionInstance:    data.evolutionInstance,
        whatsappAiEnabled:    data.whatsappAiEnabled,
        systemPromptWhatsapp: data.systemPromptWhatsapp,
      })
    } catch {
      toast.error('Erro ao salvar configurações')
    } finally {
      setSavingCfg(false)
    }
  }

  async function handleCreate() {
    setActionLoading('create')
    try {
      const res = await fetch('/api/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Instância criada')
      await checkState()
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao criar instância')
    } finally {
      setActionLoading('')
    }
  }

  async function handleConnect() {
    setLoadingQr(true)
    try {
      const res = await fetch('/api/whatsapp/evolution?action=connect')
      const data = await res.json() as ConnectResponse
      if (!res.ok) throw new Error((data as any).error)
      const base64 = data.base64 ?? data.qrcode?.base64
      if (base64) {
        setQrCode(base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`)
      } else {
        toast.error('QR code não retornado pela API')
      }
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao gerar QR code')
    } finally {
      setLoadingQr(false)
    }
  }

  async function handleLogout() {
    setActionLoading('logout')
    try {
      const res = await fetch('/api/whatsapp/evolution', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
      if (!res.ok) throw new Error()
      toast.success('WhatsApp desconectado')
      setQrCode(null)
      setConnState('close')
    } catch {
      toast.error('Erro ao desconectar')
    } finally {
      setActionLoading('')
    }
  }

  async function handleSetWebhook() {
    const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`
    setActionLoading('webhook')
    try {
      const res = await fetch('/api/whatsapp/evolution', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'webhook', webhookUrl }),
      })
      if (!res.ok) throw new Error()
      toast.success('Webhook configurado')
    } catch {
      toast.error('Erro ao configurar webhook')
    } finally {
      setActionLoading('')
    }
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/webhook`
    : '/api/whatsapp/webhook'

  const stateColor = connState === 'open' ? 'text-green-status' : connState === 'connecting' ? 'text-yellow-600' : 'text-on-surface-variant/50'
  const stateLabel = connState === 'open' ? 'Conectado' : connState === 'connecting' ? 'Conectando...' : connState === 'close' ? 'Desconectado' : 'Desconhecido'
  const stateIcon  = connState === 'open' ? 'check_circle' : connState === 'connecting' ? 'sync' : 'cancel'

  return (
    <form onSubmit={handleSubmit(onSaveConfig)} className="space-y-5">

      {/* Config Evolution API */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#25D366]/15">
            <span className="material-symbols-outlined text-[18px] text-[#25D366]" style={{ fontVariationSettings: "'FILL' 1" }}>
              chat
            </span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Evolution API</h3>
            <p className="text-[12px] text-on-surface-variant/80">Configuração da instância WhatsApp</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL}>URL da API</label>
              <input
                {...register('evolutionApiUrl')}
                className={INPUT}
                placeholder="https://evolution.seudominio.com.br"
              />
            </div>
            <div>
              <label className={LABEL}>Nome da Instância</label>
              <input
                {...register('evolutionInstance')}
                className={INPUT}
                placeholder="contabai"
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>API Key</label>
            <input
              {...register('evolutionApiKey')}
              type="password"
              className={INPUT}
              placeholder="Deixe em branco para manter a atual"
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      {/* Status + Ações */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>phone_iphone</span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface">Conexão WhatsApp</h3>
              <p className="text-[12px] text-on-surface-variant/80">Status e gerenciamento da instância</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => checkState()}
            disabled={loadingState}
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant/20 px-3 py-1.5 text-[12px] font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50"
          >
            {loadingState ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="material-symbols-outlined text-[14px]">refresh</span>}
            Atualizar
          </button>
        </div>

        {/* Status badge */}
        <div className={cn('flex items-center gap-2 mb-5 text-[13px] font-semibold', stateColor)}>
          <span className={cn('material-symbols-outlined text-[18px]', connState === 'connecting' && 'animate-spin')}
            style={{ fontVariationSettings: "'FILL' 1" }}>
            {stateIcon}
          </span>
          {stateLabel}
        </div>

        {/* QR Code */}
        {qrCode && connState !== 'open' && (
          <div className="mb-5 flex flex-col items-center gap-3 rounded-xl border border-outline-variant/15 bg-surface-container-low/50 p-5">
            <p className="text-[12px] font-semibold text-on-surface-variant">Escaneie com o WhatsApp do celular</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="QR Code WhatsApp" className="h-52 w-52 rounded-lg" />
            <p className="text-[11px] text-on-surface-variant/60">Verificando automaticamente a cada 5s...</p>
          </div>
        )}

        {/* Botões de ação */}
        <div className="flex flex-wrap gap-2">
          {connState === 'unknown' || connState === 'close' || connState === 'connecting' ? (
            <>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!!actionLoading}
                className="flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-card px-4 py-2 text-[13px] font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50"
              >
                {actionLoading === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">add_circle</span>}
                Criar instância
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={loadingQr || !!actionLoading}
                className="flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#25D366]/90 transition-colors disabled:opacity-50"
              >
                {loadingQr ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">qr_code</span>}
                Gerar QR Code
              </button>
            </>
          ) : connState === 'open' ? (
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              disabled={!!actionLoading}
              className="flex items-center gap-2 rounded-xl border border-error/30 px-4 py-2 text-[13px] font-semibold text-error hover:bg-error/8 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'logout' ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">logout</span>}
              Desconectar
            </button>
          ) : null}
        </div>
      </div>

      {/* IA no WhatsApp */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface">IA no WhatsApp</h3>
              <p className="text-[12px] text-on-surface-variant/80">Responder automaticamente mensagens recebidas</p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[12px] font-semibold text-on-surface-variant">Ativar</span>
            <input type="checkbox" {...register('whatsappAiEnabled')} className="accent-primary h-4 w-4 rounded" />
          </label>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={LABEL}>System Prompt — WhatsApp</label>
            <textarea
              {...register('systemPromptWhatsapp')}
              rows={4}
              className="w-full rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 resize-y min-h-[96px]"
              placeholder="Você é o assistente do escritório ContabAI via WhatsApp. Responda de forma concisa e direta, sem formatação markdown..."
            />
            <p className="text-[11px] text-on-surface-variant/50">Deixe em branco para usar o prompt padrão do sistema.</p>
          </div>
        </div>
      </div>

      {/* Webhook */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>webhook</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Webhook</h3>
            <p className="text-[12px] text-on-surface-variant/80">Recebe mensagens do WhatsApp e dispara a IA</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-outline-variant/15 bg-surface-container-low/50 px-4 py-3 mb-4">
          <span className="flex-1 truncate font-mono text-[12px] text-on-surface-variant">{webhookUrl}</span>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(webhookUrl); setWebhookCopied(true); setTimeout(() => setWebhookCopied(false), 1500) }}
            className="shrink-0 text-on-surface-variant/60 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">{webhookCopied ? 'check' : 'content_copy'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSetWebhook}
          disabled={!!actionLoading}
          className="flex items-center gap-2 rounded-xl border border-outline-variant/20 bg-card px-4 py-2 text-[13px] font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50"
        >
          {actionLoading === 'webhook' ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">link</span>}
          Configurar webhook na instância
        </button>
        <p className="mt-2 text-[11px] text-on-surface-variant/50">Registra automaticamente este URL na instância Evolution API</p>
      </div>

      {/* Salvar tudo */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={savingCfg}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {savingCfg ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar configurações
        </button>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); handleLogout() }}
        title="Desconectar WhatsApp?"
        description="A instância será desconectada. Você precisará gerar um novo QR Code para reconectar."
        confirmLabel="Desconectar"
        loading={actionLoading === 'logout'}
      />
    </form>
  )
}
