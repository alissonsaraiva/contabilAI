'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

const INPUT = 'w-full rounded-xl border border-transparent bg-surface-container-lowest/80 px-4 py-3 text-[14px] font-medium text-on-surface shadow-sm placeholder:text-on-surface-variant/40 transition-all hover:bg-surface-container-lowest focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/5'
const LABEL = 'block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2'

const schema = z.object({
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  whatsapp: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2).optional(),
})

type FormData = z.infer<typeof schema>

export default function ContatoPage() {
  const [loading, setLoading] = useState(false)
  const [loadingCep, setLoadingCep] = useState(false)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    void fetch('/api/escritorio')
      .then(r => r.json())
      .then(data => { if (data) reset(data) })
  }, [reset])

  async function buscarCep() {
    const cep = watch('cep')?.replace(/\D/g, '')
    if (!cep || cep.length !== 8) return
    setLoadingCep(true)
    try {
      const res = await fetch(`/api/validacoes/cep/${cep}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.logradouro) setValue('logradouro', data.logradouro)
      if (data.bairro) setValue('bairro', data.bairro)
      if (data.cidade) setValue('cidade', data.cidade)
      if (data.uf) setValue('uf', data.uf)
    } catch {
      toast.error('CEP não encontrado')
    } finally {
      setLoadingCep(false)
    }
  }

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/escritorio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      toast.success('Dados de contato salvos!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card p-4 md:p-8 shadow-sm">
      <div className="mb-8">
        <h2 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface">Contato e Endereço</h2>
        <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/70">
          Informações de contato exibidas no portal do cliente e nos contratos.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-6">
        {/* Contato */}
        <div>
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Contato</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className={LABEL}>E-mail</label>
              <input {...register('email')} className={INPUT} placeholder="contato@escritorio.com.br" />
              {errors.email && <p className="text-xs font-medium text-error">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className={LABEL}>Telefone</label>
              <input {...register('telefone')} className={INPUT} placeholder="(11) 3000-0000" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className={LABEL}>WhatsApp</label>
              <input {...register('whatsapp')} className={INPUT} placeholder="(11) 99999-9999" />
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div>
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">Endereço</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className={LABEL}>CEP</label>
              <div className="flex gap-2">
                <input
                  {...register('cep')}
                  className={INPUT}
                  placeholder="00000-000"
                  maxLength={9}
                />
                <button
                  type="button"
                  onClick={buscarCep}
                  disabled={loadingCep}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 text-[13px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
                >
                  {loadingCep ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">search</span>}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL}>Número</label>
              <input {...register('numero')} className={INPUT} placeholder="123" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className={LABEL}>Logradouro</label>
              <input {...register('logradouro')} className={INPUT} placeholder="Rua das Acácias" />
            </div>

            <div className="space-y-1.5">
              <label className={LABEL}>Complemento</label>
              <input {...register('complemento')} className={INPUT} placeholder="Sala 201" />
            </div>

            <div className="space-y-1.5">
              <label className={LABEL}>Bairro</label>
              <input {...register('bairro')} className={INPUT} placeholder="Centro" />
            </div>

            <div className="space-y-1.5">
              <label className={LABEL}>Cidade</label>
              <input {...register('cidade')} className={INPUT} placeholder="São Paulo" />
            </div>

            <div className="space-y-1.5">
              <label className={LABEL}>UF</label>
              <input {...register('uf')} className={INPUT} placeholder="SP" maxLength={2} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low/50 px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant/60">mail</span>
          <p className="text-[13px] text-on-surface-variant">
            Configurações de e-mail (SMTP/IMAP) foram movidas para{' '}
            <Link href="/crm/configuracoes/email" className="font-semibold text-primary hover:underline">
              Configurações → E-mail
            </Link>
          </p>
        </div>

        <div className="mt-8 flex flex-col-reverse md:flex-row md:items-center justify-end gap-3 border-t border-outline-variant/15 pt-6">
          <button
            type="submit"
            disabled={loading}
            className="w-full md:w-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60 min-w-[160px]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
            Salvar alterações
          </button>
        </div>
      </form>
    </div>
  )
}
