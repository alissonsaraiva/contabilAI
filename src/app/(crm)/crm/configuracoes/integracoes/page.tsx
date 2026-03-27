'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface font-mono shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 placeholder:font-sans'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

const schema = z.object({
  provedorAssinatura: z.enum(['zapsign', 'clicksign']).optional(),
  zapsignToken:       z.string().optional(),
  clicksignKey:       z.string().optional(),
  zapiInstanceId:     z.string().optional(),
  zapiToken:          z.string().optional(),
  serproCpfToken:     z.string().optional(),
  serproCnpjToken:    z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function IntegracoesPage() {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, reset, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { provedorAssinatura: 'zapsign' },
  })

  const provedor = watch('provedorAssinatura')

  useEffect(() => {
    fetch('/api/escritorio')
      .then(r => r.json())
      .then(data => { if (data) reset({ provedorAssinatura: 'zapsign', ...data }) })
  }, [reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/escritorio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      toast.success('Integrações salvas!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Assinatura Eletrônica ──────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              draw
            </span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Assinatura Eletrônica</h3>
            <p className="text-[12px] text-on-surface-variant/80">Escolha o provedor para envio de contratos</p>
          </div>
        </div>

        {/* Seletor de provedor */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'zapsign',   label: 'ZapSign',   sub: 'Brasileira · ICP-Basic', color: 'text-green-600' },
            { value: 'clicksign', label: 'ClickSign',  sub: 'Brasileira · ICP-Basic', color: 'text-blue-600' },
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
              <input
                type="radio"
                value={opt.value}
                {...register('provedorAssinatura')}
                className="accent-primary"
              />
              <div>
                <p className={cn('text-[13px] font-semibold', provedor === opt.value ? 'text-primary' : 'text-on-surface')}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-on-surface-variant/70">{opt.sub}</p>
              </div>
            </label>
          ))}
        </div>

        {/* ZapSign token */}
        <div className={provedor === 'zapsign' ? '' : 'opacity-40 pointer-events-none'}>
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">ZapSign</span>
              {provedor === 'zapsign' && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Ativo</span>
              )}
            </div>
            <div>
              <label className={LABEL}>API Token</label>
              <input
                {...register('zapsignToken')}
                className={INPUT}
                placeholder="Cole o token da aba Configurações → Integrações do ZapSign"
                type="password"
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">
                Dashboard ZapSign → Configurações → Integrações → API Token
              </p>
            </div>
          </div>
        </div>

        {/* ClickSign key */}
        <div className={provedor === 'clicksign' ? '' : 'opacity-40 pointer-events-none'}>
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider text-on-surface-variant">ClickSign</span>
              {provedor === 'clicksign' && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Ativo</span>
              )}
            </div>
            <div>
              <label className={LABEL}>Access Token (API Key)</label>
              <input
                {...register('clicksignKey')}
                className={INPUT}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                type="password"
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-on-surface-variant/60">
                ClickSign → Conta → Integrações → Access Token
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Z-API (WhatsApp) ───────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Z-API (WhatsApp)</h3>
            <p className="text-[12px] text-on-surface-variant/80">Envio de mensagens automáticas via WhatsApp</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: 'zapiInstanceId', label: 'Instance ID', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
            { name: 'zapiToken',      label: 'Token',        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
          ].map(campo => (
            <div key={campo.name} className="space-y-1.5">
              <label className={LABEL}>{campo.label}</label>
              <input
                {...register(campo.name as keyof FormData)}
                className={INPUT}
                placeholder={campo.placeholder}
                type="password"
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Serpro ────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-on-surface">Serpro</h3>
            <p className="text-[12px] text-on-surface-variant/80">Validação de CPF e CNPJ</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { name: 'serproCpfToken',  label: 'Token CPF',  placeholder: 'Bearer xxxxxxxxxxxxxxxx' },
            { name: 'serproCnpjToken', label: 'Token CNPJ', placeholder: 'Bearer xxxxxxxxxxxxxxxx' },
          ].map(campo => (
            <div key={campo.name} className="space-y-1.5">
              <label className={LABEL}>{campo.label}</label>
              <input
                {...register(campo.name as keyof FormData)}
                className={INPUT}
                placeholder={campo.placeholder}
                type="password"
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={handleSubmit(onSubmit)}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60 min-w-[160px]"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
          Salvar integrações
        </button>
      </div>
    </div>
  )
}
