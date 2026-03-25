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
  clicksignKey: z.string().optional(),
  zapiInstanceId: z.string().optional(),
  zapiToken: z.string().optional(),
  serproCpfToken: z.string().optional(),
  serproCnpjToken: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const INTEGRACOES = [
  {
    key: 'clicksign',
    nome: 'ClickSign',
    descricao: 'Assinatura eletrônica de contratos',
    icone: 'draw',
    campos: [{ name: 'clicksignKey', label: 'API Key', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' }],
  },
  {
    key: 'zapi',
    nome: 'Z-API (WhatsApp)',
    descricao: 'Envio de mensagens automáticas via WhatsApp',
    icone: 'chat',
    campos: [
      { name: 'zapiInstanceId', label: 'Instance ID', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
      { name: 'zapiToken', label: 'Token', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
  },
  {
    key: 'serpro',
    nome: 'Serpro',
    descricao: 'Validação de CPF e CNPJ',
    icone: 'verified_user',
    campos: [
      { name: 'serproCpfToken', label: 'Token CPF', placeholder: 'Bearer xxxxxxxxxxxxxxxx' },
      { name: 'serproCnpjToken', label: 'Token CNPJ', placeholder: 'Bearer xxxxxxxxxxxxxxxx' },
    ],
  },
]

export default function IntegracoesPage() {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, reset } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    fetch('/api/escritorio')
      .then(r => r.json())
      .then(data => { if (data) reset(data) })
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
      {INTEGRACOES.map(integ => (
        <div key={integ.key} className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                {integ.icone}
              </span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface">{integ.nome}</h3>
              <p className="text-[12px] text-on-surface-variant/80">{integ.descricao}</p>
            </div>
          </div>

          <div className={cn("grid gap-4", integ.campos.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
            {integ.campos.map(campo => (
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
      ))}

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
