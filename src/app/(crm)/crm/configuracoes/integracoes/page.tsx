'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const INPUT = 'w-full h-12 rounded-xl border border-transparent bg-surface-container-lowest/80 px-4 text-[14px] font-mono text-on-surface shadow-sm placeholder:text-on-surface-variant/40 placeholder:font-sans transition-all hover:bg-surface-container-lowest focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/5'

const schema = z.object({
  provedorAssinatura: z.enum(['zapsign', 'clicksign']).optional(),
  zapsignToken: z.string().optional(),
  clicksignKey: z.string().optional(),
  clicksignHmacSecret: z.string().optional(),
  zapiInstanceId: z.string().optional(),
  zapiToken: z.string().optional(),
  serproCpfToken: z.string().optional(),
  serproCnpjToken: z.string().optional(),
  asaasApiKey: z.string().optional(),
  asaasAmbiente: z.enum(['sandbox', 'producao']).optional(),
  asaasWebhookToken: z.string().optional(),
  spedyApiKey: z.string().optional(),
  spedyAmbiente: z.enum(['sandbox', 'producao']).optional(),
  // Configuração fiscal padrão (usada como fallback em toda emissão)
  spedyFederalServiceCode: z.string().optional(),
  spedyCityServiceCode: z.string().optional(),
  spedyIssAliquotaPercent: z.number().min(0).max(100).optional(), // exibido em %; salvo como 0.0500
  spedyTaxationType: z.enum(['taxationInMunicipality', 'exemptFromTaxation', 'notSubjectToTaxation', 'taxationOutsideMunicipality']).optional(),
  spedyIssWithheld: z.boolean().optional(),
  // Comportamento de entrega
  spedyAutoEmitirOS: z.boolean().optional(),
  spedyEnviarAoAutorizar: z.boolean().optional(),
  spedyEnviarCanalPadrao: z.enum(['whatsapp', 'email', 'portal']).optional(),
  spedyDescricaoTemplate: z.string().optional(),
})

type FormData = z.infer<typeof schema>

type Configured = {
  zapsignToken: boolean
  clicksignKey: boolean
  clicksignHmacSecret: boolean
  zapiInstanceId: boolean
  zapiToken: boolean
  serproCpfToken: boolean
  serproCnpjToken: boolean
  asaasApiKey: boolean
  asaasWebhookToken: boolean
  spedyApiKey: boolean
}

// ── Seção colapsável ────────────────────────────────────────────────────────
function Section({
  icon, title, subtitle, configCount, defaultOpen = false, children,
}: {
  icon: string
  title: string
  subtitle: string
  configCount: number   // quantos campos estão configurados nessa seção
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card shadow-sm">
      {/* Header clicável */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-surface-container-low/60"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            {icon}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-on-surface">{title}</h3>
            {configCount > 0 && (
              <span className="flex items-center gap-0.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-600">
                <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                {configCount} configurado{configCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-[12px] text-on-surface-variant/80">{subtitle}</p>
        </div>
        <span
          className={cn(
            'material-symbols-outlined text-[20px] text-on-surface-variant/50 transition-transform duration-200 shrink-0',
            open && 'rotate-180',
          )}
        >
          expand_more
        </span>
      </button>

      {/* Conteúdo */}
      {open && (
        <div className="border-t border-outline-variant/10 p-5 space-y-5">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Label com badge Configurado ─────────────────────────────────────────────
function FieldLabel({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-[13px] font-semibold text-on-surface-variant">{label}</label>
      {configured && (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600">
          <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          Configurado
        </span>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

export default function IntegracoesPage() {
  const [loading, setLoading] = useState(false)
  const [configured, setConfigured] = useState<Configured>({
    zapsignToken: false, clicksignKey: false, clicksignHmacSecret: false,
    zapiInstanceId: false, zapiToken: false, serproCpfToken: false, serproCnpjToken: false,
    asaasApiKey: false, asaasWebhookToken: false, spedyApiKey: false,
  })

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { provedorAssinatura: 'zapsign' },
  })

  const provedor = watch('provedorAssinatura')
  const asaasAmbiente = watch('asaasAmbiente')
  const spedyAmbiente = watch('spedyAmbiente')
  const spedyIssWithheld = watch('spedyIssWithheld')
  const spedyAutoEmitirOS = watch('spedyAutoEmitirOS')
  const spedyEnviarAoAutorizar = watch('spedyEnviarAoAutorizar')
  const spedyEnviarCanalPadrao = watch('spedyEnviarCanalPadrao')
  const spedyTaxationType = watch('spedyTaxationType')

  useEffect(() => {
    fetch('/api/escritorio')
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (!data) return
        // Converte alíquota de decimal (0.05) para % (5) para exibição
        const issAliquotaDecimal = data.spedyIssAliquota != null ? Number(data.spedyIssAliquota) : null
        reset({
          provedorAssinatura: (data.provedorAssinatura as string) === 'clicksign' ? 'clicksign' : 'zapsign',
          asaasAmbiente: (data.asaasAmbiente as string) === 'producao' ? 'producao' : 'sandbox',
          spedyAmbiente: (data.spedyAmbiente as string) === 'producao' ? 'producao' : 'sandbox',
          // Chaves — em branco (nunca relemos do backend)
          zapsignToken: '', clicksignKey: '', clicksignHmacSecret: '',
          zapiInstanceId: '', zapiToken: '', serproCpfToken: '', serproCnpjToken: '',
          asaasApiKey: '', asaasWebhookToken: '', spedyApiKey: '',
          // Configuração fiscal Spedy
          spedyFederalServiceCode: (data.spedyFederalServiceCode as string) ?? '',
          spedyCityServiceCode: (data.spedyCityServiceCode as string) ?? '',
          spedyIssAliquotaPercent: issAliquotaDecimal != null ? Math.round(issAliquotaDecimal * 10000) / 100 : 5,
          spedyTaxationType: (data.spedyTaxationType as FormData['spedyTaxationType']) ?? 'taxationInMunicipality',
          spedyIssWithheld: (data.spedyIssWithheld as boolean) ?? false,
          // Entrega
          spedyAutoEmitirOS: (data.spedyAutoEmitirOS as boolean) ?? false,
          spedyEnviarAoAutorizar: (data.spedyEnviarAoAutorizar as boolean) ?? true,
          spedyEnviarCanalPadrao: (data.spedyEnviarCanalPadrao as FormData['spedyEnviarCanalPadrao']) ?? 'whatsapp',
          spedyDescricaoTemplate: (data.spedyDescricaoTemplate as string) ?? '',
        })
        setConfigured({
          zapsignToken: !!data.zapsignToken,
          clicksignKey: !!data.clicksignKey,
          clicksignHmacSecret: !!data.clicksignHmacSecret,
          zapiInstanceId: !!data.zapiInstanceId,
          zapiToken: !!data.zapiToken,
          serproCpfToken: !!data.serproCpfToken,
          serproCnpjToken: !!data.serproCnpjToken,
          asaasApiKey: !!data.asaasApiKey,
          asaasWebhookToken: !!data.asaasWebhookToken,
          spedyApiKey: !!data.spedyApiKey,
        })
      })
  }, [reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        provedorAssinatura: data.provedorAssinatura,
        asaasAmbiente: data.asaasAmbiente ?? 'sandbox',
        spedyAmbiente: data.spedyAmbiente ?? 'sandbox',
      }
      if (data.zapsignToken) payload.zapsignToken = data.zapsignToken
      if (data.clicksignKey) payload.clicksignKey = data.clicksignKey
      if (data.clicksignHmacSecret) payload.clicksignHmacSecret = data.clicksignHmacSecret
      if (data.zapiInstanceId) payload.zapiInstanceId = data.zapiInstanceId
      if (data.zapiToken) payload.zapiToken = data.zapiToken
      if (data.serproCpfToken) payload.serproCpfToken = data.serproCpfToken
      if (data.serproCnpjToken) payload.serproCnpjToken = data.serproCnpjToken
      if (data.asaasApiKey) payload.asaasApiKey = data.asaasApiKey
      if (data.asaasWebhookToken) payload.asaasWebhookToken = data.asaasWebhookToken
      if (data.spedyApiKey) payload.spedyApiKey = data.spedyApiKey

      // Configuração fiscal Spedy — sempre salva (incluindo booleanos e zeros)
      payload.spedyFederalServiceCode = data.spedyFederalServiceCode ?? ''
      payload.spedyCityServiceCode    = data.spedyCityServiceCode ?? ''
      payload.spedyIssAliquota        = data.spedyIssAliquotaPercent != null
        ? Math.round(data.spedyIssAliquotaPercent * 100) / 10000  // % → decimal: 5 → 0.0500
        : 0.05
      payload.spedyTaxationType       = data.spedyTaxationType ?? 'taxationInMunicipality'
      payload.spedyIssWithheld        = data.spedyIssWithheld ?? false
      // Entrega
      payload.spedyAutoEmitirOS       = data.spedyAutoEmitirOS ?? false
      payload.spedyEnviarAoAutorizar  = data.spedyEnviarAoAutorizar ?? true
      payload.spedyEnviarCanalPadrao  = data.spedyEnviarCanalPadrao ?? 'whatsapp'
      payload.spedyDescricaoTemplate  = data.spedyDescricaoTemplate ?? ''

      const res = await fetch('/api/escritorio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()

      setConfigured(prev => ({
        zapsignToken: prev.zapsignToken || !!data.zapsignToken,
        clicksignKey: prev.clicksignKey || !!data.clicksignKey,
        clicksignHmacSecret: prev.clicksignHmacSecret || !!data.clicksignHmacSecret,
        zapiInstanceId: prev.zapiInstanceId || !!data.zapiInstanceId,
        zapiToken: prev.zapiToken || !!data.zapiToken,
        serproCpfToken: prev.serproCpfToken || !!data.serproCpfToken,
        serproCnpjToken: prev.serproCnpjToken || !!data.serproCnpjToken,
        asaasApiKey: prev.asaasApiKey || !!data.asaasApiKey,
        asaasWebhookToken: prev.asaasWebhookToken || !!data.asaasWebhookToken,
        spedyApiKey: prev.spedyApiKey || !!data.spedyApiKey,
      }))
      toast.success('Integrações salvas!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  // Contadores por seção para mostrar no header colapsado
  const spedyCount = configured.spedyApiKey ? 1 : 0
  const assinaturaCount =
    (provedor === 'zapsign' ? (configured.zapsignToken ? 1 : 0) : 0) +
    (provedor === 'clicksign' ? (configured.clicksignKey ? 1 : 0) + (configured.clicksignHmacSecret ? 1 : 0) : 0)
  const zapiCount = (configured.zapiInstanceId ? 1 : 0) + (configured.zapiToken ? 1 : 0)
  const serproCount = (configured.serproCpfToken ? 1 : 0) + (configured.serproCnpjToken ? 1 : 0)
  const asaasCount = (configured.asaasApiKey ? 1 : 0) + (configured.asaasWebhookToken ? 1 : 0)

  return (
    <div className="space-y-3">

      {/* ── Assinatura Eletrônica ──────────────────────────────────────────── */}
      <Section icon="draw" title="Assinatura Eletrônica" subtitle="Provedor para envio e assinatura de contratos" configCount={assinaturaCount} defaultOpen>

        {/* Seletor de provedor */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'zapsign', label: 'ZapSign', sub: 'Brasileira · ICP-Basic' },
            { value: 'clicksign', label: 'ClickSign', sub: 'Brasileira · ICP-Basic' },
          ].map(opt => (
            <label
              key={opt.value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors',
                provedor === opt.value
                  ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                  : 'border-outline-variant/20 hover:border-outline-variant/40',
              )}
            >
              <input type="radio" value={opt.value} {...register('provedorAssinatura')} className="accent-primary" />
              <div>
                <p className={cn('text-[13px] font-semibold', provedor === opt.value ? 'text-primary' : 'text-on-surface')}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-on-surface-variant/70">{opt.sub}</p>
              </div>
            </label>
          ))}
        </div>

        {/* ZapSign */}
        {provedor === 'zapsign' && (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">ZapSign</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Ativo</span>
            </div>
            <div>
              <FieldLabel label="API Token" configured={configured.zapsignToken} />
              <input
                {...register('zapsignToken')}
                className={INPUT}
                placeholder={configured.zapsignToken ? 'Nova chave (deixe em branco para manter)' : 'Cole o token da aba Configurações → Integrações do ZapSign'}
                type="password" autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">Dashboard ZapSign → Configurações → Integrações → API Token</p>
            </div>
          </div>
        )}

        {/* ClickSign */}
        {provedor === 'clicksign' && (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">ClickSign</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Ativo</span>
            </div>
            <div>
              <FieldLabel label="Access Token (API Key)" configured={configured.clicksignKey} />
              <input
                {...register('clicksignKey')}
                className={INPUT}
                placeholder={configured.clicksignKey ? 'Nova chave (deixe em branco para manter)' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                type="password" autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">ClickSign → Conta → Integrações → Access Token</p>
            </div>
            <div>
              <FieldLabel label="HMAC Secret (Webhook)" configured={configured.clicksignHmacSecret} />
              <input
                {...register('clicksignHmacSecret')}
                className={INPUT}
                placeholder={configured.clicksignHmacSecret ? 'Nova chave (deixe em branco para manter)' : 'Chave HMAC SHA256 fornecida pelo ClickSign'}
                type="password" autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">ClickSign → Configurações → Webhooks → HMAC SHA256 Secret</p>
            </div>
          </div>
        )}

      </Section>

      {/* ── Asaas (Cobranças) ─────────────────────────────────────────────── */}
      <Section icon="payments" title="Asaas" subtitle="Gestão de cobranças, boletos e PIX recorrentes" configCount={asaasCount}>

        {/* Ambiente */}
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-on-surface-variant">Ambiente</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'sandbox', label: 'Sandbox', sub: 'Testes — sem cobranças reais' },
              { value: 'producao', label: 'Produção', sub: 'Cobranças reais — use com cuidado' },
            ].map(opt => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors',
                  asaasAmbiente === opt.value
                    ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                    : 'border-outline-variant/20 hover:border-outline-variant/40',
                )}
              >
                <input type="radio" value={opt.value} {...register('asaasAmbiente')} className="accent-primary" />
                <div>
                  <p className={cn('text-[13px] font-semibold', asaasAmbiente === opt.value ? 'text-primary' : 'text-on-surface')}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-on-surface-variant/70">{opt.sub}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div>
          <FieldLabel label="API Key" configured={configured.asaasApiKey} />
          <input
            {...register('asaasApiKey')}
            className={INPUT}
            placeholder={configured.asaasApiKey ? 'Nova chave (deixe em branco para manter)' : '$aact_... (API Key do painel Asaas)'}
            type="password" autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-on-surface-variant/60">
            Asaas → Minha Conta → Integrações → API Key
          </p>
        </div>

        {/* Webhook Token */}
        <div>
          <FieldLabel label="Webhook Token" configured={configured.asaasWebhookToken} />
          <input
            {...register('asaasWebhookToken')}
            className={INPUT}
            placeholder={configured.asaasWebhookToken ? 'Novo token (deixe em branco para manter)' : 'Token secreto para validar eventos do webhook'}
            type="password" autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-on-surface-variant/60">
            Defina um token secreto qualquer. Configure o mesmo no Asaas → Configurações → Notificações → Webhook.
            URL: <span className="font-mono">https://seudominio/api/webhooks/asaas</span>
          </p>
        </div>

      </Section>

      {/* ── Z-API (WhatsApp) ───────────────────────────────────────────────── */}
      <Section icon="chat" title="Z-API (WhatsApp)" subtitle="Envio de mensagens automáticas via WhatsApp" configCount={zapiCount}>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: 'zapiInstanceId' as const, label: 'Instance ID', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
            { name: 'zapiToken' as const, label: 'Token', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
          ].map(campo => (
            <div key={campo.name}>
              <FieldLabel label={campo.label} configured={configured[campo.name]} />
              <input
                {...register(campo.name)}
                className={INPUT}
                placeholder={configured[campo.name] ? 'Nova chave (deixe em branco para manter)' : campo.placeholder}
                type="password" autoComplete="off"
              />
            </div>
          ))}
        </div>
      </Section>

      {/* ── Spedy (NFS-e) ─────────────────────────────────────────────────── */}
      <Section icon="receipt_long" title="Spedy — Nota Fiscal de Serviço" subtitle="Emissão de NFS-e automatizada para clientes via IA ou painel" configCount={spedyCount}>

        {/* Ambiente */}
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-on-surface-variant">Ambiente</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'sandbox', label: 'Sandbox', sub: 'Testes — notas não são registradas na prefeitura' },
              { value: 'producao', label: 'Produção', sub: 'Emissão real — notas enviadas à prefeitura' },
            ].map(opt => (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors',
                  spedyAmbiente === opt.value
                    ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                    : 'border-outline-variant/20 hover:border-outline-variant/40',
                )}
              >
                <input type="radio" value={opt.value} {...register('spedyAmbiente')} className="accent-primary" />
                <div>
                  <p className={cn('text-[13px] font-semibold', spedyAmbiente === opt.value ? 'text-primary' : 'text-on-surface')}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-on-surface-variant/70">{opt.sub}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* API Key Owner */}
        <div>
          <FieldLabel label="API Key Owner (chave mestra)" configured={configured.spedyApiKey} />
          <input
            {...register('spedyApiKey')}
            className={INPUT}
            placeholder={configured.spedyApiKey ? 'Nova chave (deixe em branco para manter)' : 'sk_... (Owner API Key do painel Spedy)'}
            type="password" autoComplete="off"
          />
          <p className="mt-1 text-[11px] text-on-surface-variant/60">
            Painel Spedy → Configurações → Integrações → API Keys → Owner Key. Essa chave permite criar empresas secundárias para cada cliente.
          </p>
        </div>

        {/* ─── Configuração Fiscal Padrão ───────────────────────────────── */}
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/40 p-4 space-y-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">Configuração Fiscal Padrão</p>
          <p className="text-[11px] text-on-surface-variant/70 -mt-2">
            Usados como fallback em toda emissão — podem ser sobrescritos por cliente.
          </p>

          {/* Códigos de serviço */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Código LC 116/03</label>
              <input
                {...register('spedyFederalServiceCode')}
                className={INPUT}
                placeholder="ex: 1.07"
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">Código federal de serviço (tabela LC 116)</p>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Código Municipal</label>
              <input
                {...register('spedyCityServiceCode')}
                className={INPUT}
                placeholder="ex: 0107"
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">Código de serviço da prefeitura</p>
            </div>
          </div>

          {/* Alíquota ISS + ISS retido */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Alíquota ISS (%)</label>
              <input
                {...register('spedyIssAliquotaPercent', { valueAsNumber: true })}
                type="number"
                step="0.01"
                min="0"
                max="100"
                className={INPUT}
                placeholder="5"
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">Ex: 5 = 5% de ISS. Padrão: 5%.</p>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">ISS Retido na Fonte</label>
              <div className="flex items-center gap-3 h-11">
                <label className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors text-[13px] font-semibold',
                  spedyIssWithheld ? 'border-primary/50 bg-primary/5 text-primary ring-2 ring-primary/20' : 'border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40',
                )}>
                  <input type="radio" value="true" checked={spedyIssWithheld === true} onChange={() => setValue('spedyIssWithheld', true)} className="accent-primary" />
                  Retido
                </label>
                <label className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors text-[13px] font-semibold',
                  !spedyIssWithheld ? 'border-primary/50 bg-primary/5 text-primary ring-2 ring-primary/20' : 'border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40',
                )}>
                  <input type="radio" value="false" checked={spedyIssWithheld !== true} onChange={() => setValue('spedyIssWithheld', false)} className="accent-primary" />
                  Não retido
                </label>
              </div>
            </div>
          </div>

          {/* Tipo de tributação */}
          <div>
            <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Tipo de Tributação</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'taxationInMunicipality',       label: 'Tributação no município',        sub: 'ISS recolhido no município do prestador' },
                { value: 'taxationOutsideMunicipality',  label: 'Tributação fora do município',   sub: 'ISS recolhido no município do tomador' },
                { value: 'exemptFromTaxation',           label: 'Isento',                         sub: 'Serviço isento de ISS' },
                { value: 'notSubjectToTaxation',         label: 'Não incidência',                 sub: 'Fora do campo de incidência do ISS' },
              ].map(opt => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors',
                    spedyTaxationType === opt.value
                      ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                      : 'border-outline-variant/20 hover:border-outline-variant/40',
                  )}
                >
                  <input type="radio" value={opt.value} {...register('spedyTaxationType')} className="accent-primary mt-0.5 shrink-0" />
                  <div>
                    <p className={cn('text-[12px] font-semibold', spedyTaxationType === opt.value ? 'text-primary' : 'text-on-surface')}>{opt.label}</p>
                    <p className="text-[10px] text-on-surface-variant/70">{opt.sub}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Entrega ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low/40 p-4 space-y-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">Entrega ao Cliente</p>

          {/* Auto-emitir ao resolver OS + Enviar ao autorizar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-2">Auto-emitir ao fechar OS</label>
              <div className="flex items-center gap-3 h-11">
                {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map(({ v, l }) => (
                  <label key={String(v)} className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors text-[13px] font-semibold',
                    spedyAutoEmitirOS === v ? 'border-primary/50 bg-primary/5 text-primary ring-2 ring-primary/20' : 'border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40',
                  )}>
                    <input type="radio" checked={spedyAutoEmitirOS === v} onChange={() => setValue('spedyAutoEmitirOS', v)} className="accent-primary" />
                    {l}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-on-surface-variant/60">Emite a NFS-e automaticamente quando uma OS é resolvida</p>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-on-surface-variant mb-2">Enviar PDF ao autorizar</label>
              <div className="flex items-center gap-3 h-11">
                {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map(({ v, l }) => (
                  <label key={String(v)} className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors text-[13px] font-semibold',
                    spedyEnviarAoAutorizar === v ? 'border-primary/50 bg-primary/5 text-primary ring-2 ring-primary/20' : 'border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40',
                  )}>
                    <input type="radio" checked={spedyEnviarAoAutorizar === v} onChange={() => setValue('spedyEnviarAoAutorizar', v)} className="accent-primary" />
                    {l}
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-on-surface-variant/60">Entrega o PDF da NFS-e ao cliente logo após a autorização da prefeitura</p>
            </div>
          </div>

          {/* Canal padrão */}
          <div>
            <label className="block text-[13px] font-semibold text-on-surface-variant mb-2">Canal de entrega padrão</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
                { value: 'email',    label: 'E-mail',   icon: 'mail' },
                { value: 'portal',   label: 'Portal',   icon: 'open_in_browser' },
              ].map(opt => (
                <label
                  key={opt.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-colors',
                    spedyEnviarCanalPadrao === opt.value
                      ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                      : 'border-outline-variant/20 hover:border-outline-variant/40',
                  )}
                >
                  <input type="radio" value={opt.value} {...register('spedyEnviarCanalPadrao')} className="accent-primary" />
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>{opt.icon}</span>
                  <p className={cn('text-[13px] font-semibold', spedyEnviarCanalPadrao === opt.value ? 'text-primary' : 'text-on-surface')}>{opt.label}</p>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-on-surface-variant/60">Canal usado quando a entrega é disparada automaticamente. Sempre disponível no portal independente da escolha.</p>
          </div>

          {/* Template de descrição */}
          <div>
            <label className="block text-[13px] font-semibold text-on-surface-variant mb-1.5">Template de descrição da NFS-e</label>
            <textarea
              {...register('spedyDescricaoTemplate')}
              rows={3}
              className="w-full resize-y rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] font-mono text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 placeholder:font-sans custom-scrollbar"
              placeholder="Deixe em branco para usar a descrição informada em cada emissão."
            />
            <p className="mt-1 text-[11px] text-on-surface-variant/60">
              Variáveis: <code className="rounded bg-surface-container px-1 py-0.5 text-[10px]">{'{{cliente.nome}}'}</code>{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[10px]">{'{{os.numero}}'}</code>{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[10px]">{'{{competencia}}'}</code>
            </p>
          </div>
        </div>

        {/* Informativo sobre o fluxo */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-blue-500" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
            <p className="text-[12px] font-semibold text-blue-600">Como funciona</p>
          </div>
          <ul className="space-y-1 text-[11px] text-on-surface-variant/80">
            <li>• A chave Owner permite gerenciar NFS-e de todos os clientes via uma única conta Spedy</li>
            <li>• Cada cliente recebe uma empresa secundária com API Key própria (criada automaticamente pelo AVOS)</li>
            <li>• A IA consegue emitir, consultar e cancelar notas diretamente pelo chat (WhatsApp, portal e CRM)</li>
            <li>• O webhook de status é configurado automaticamente ao salvar a chave</li>
          </ul>
          <p className="text-[11px] text-on-surface-variant/60 pt-1">
            Webhook URL: <span className="font-mono">https://seudominio/api/webhooks/spedy/[token]</span> — configurado automaticamente
          </p>
        </div>

      </Section>

      {/* ── Serpro ────────────────────────────────────────────────────────── */}
      <Section icon="verified_user" title="Serpro" subtitle="Validação de CPF e CNPJ" configCount={serproCount}>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: 'serproCpfToken' as const, label: 'Token CPF', placeholder: 'Bearer xxxxxxxxxxxxxxxx' },
            { name: 'serproCnpjToken' as const, label: 'Token CNPJ', placeholder: 'Bearer xxxxxxxxxxxxxxxx' },
          ].map(campo => (
            <div key={campo.name}>
              <FieldLabel label={campo.label} configured={configured[campo.name]} />
              <input
                {...register(campo.name)}
                className={INPUT}
                placeholder={configured[campo.name] ? 'Nova chave (deixe em branco para manter)' : campo.placeholder}
                type="password" autoComplete="off"
              />
            </div>
          ))}
        </div>
      </Section>

      <div className="flex flex-col-reverse md:flex-row md:items-center justify-end gap-3 pt-1">
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={loading}
          className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60 min-w-[160px]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar integrações
        </button>
      </div>
    </div>
  )
}
