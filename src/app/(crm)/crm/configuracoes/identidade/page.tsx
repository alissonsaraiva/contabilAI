'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatCNPJ } from '@/lib/utils'

const INPUT = 'w-full rounded-xl border border-transparent bg-surface-container-lowest/80 px-4 py-3 text-[14px] font-medium text-on-surface shadow-sm placeholder:text-on-surface-variant/40 transition-all hover:bg-surface-container-lowest focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/5'

const schema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  nomeFantasia: z.string().optional(),
  cnpj: z.string().optional(),
  crc: z.string().optional(),
  corPrimaria: z.string().optional(),
  corSecundaria: z.string().optional(),
  fraseBemVindo: z.string().optional(),
  metaDescricao: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function IdentidadePage() {
  const [loading, setLoading] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    void fetch('/api/escritorio')
      .then((r) => r.json())
      .then((data) => { if (data) reset({ ...data, cnpj: data.cnpj ?? '', crc: data.crc ?? '' }) })
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
      toast.success('Configurações salvas!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card p-4 md:p-8 shadow-sm">
      <div className="mb-8">
        <h2 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface">Dados Básicos</h2>
        <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/70">
          Informações cadastrais e identidade visual do escritório.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

        {/* Identificação */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-4">Identificação</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-[13px] font-semibold text-on-surface-variant">
                Nome do escritório <span className="text-error">*</span>
              </label>
              <input
                {...register('nome')}
                className={INPUT}
                placeholder="Ex: ContabAI Studio"
              />
              {errors.nome && (
                <p className="text-xs font-medium text-error">{errors.nome.message}</p>
              )}
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-[13px] font-semibold text-on-surface-variant">Nome fantasia</label>
              <input
                {...register('nomeFantasia')}
                className={INPUT}
                placeholder="Ex: ContabAI — Contabilidade Digital"
              />
            </div>
          </div>
        </div>

        {/* Registro */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-4">Registro</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-on-surface-variant">CNPJ</label>
              <input
                className={INPUT}
                placeholder="00.000.000/0001-00"
                value={watch('cnpj') ?? ''}
                onChange={e => setValue('cnpj', formatCNPJ(e.target.value))}
                inputMode="numeric"
                maxLength={18}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-on-surface-variant">CRC</label>
              <input
                {...register('crc')}
                className={INPUT}
                placeholder="CRC-SP 123456/O-4"
                maxLength={20}
              />
            </div>
          </div>
        </div>

        {/* Identidade visual */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-4">Identidade Visual</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-on-surface-variant">
                Cor principal
              </label>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-2 shadow-sm transition-colors focus-within:border-primary/50 focus-within:bg-card focus-within:ring-[3px] focus-within:ring-primary/10">
                <input type="color" className="h-7 w-8 cursor-pointer rounded bg-transparent border-0 p-0" {...register('corPrimaria')} />
                <input
                  {...register('corPrimaria')}
                  className="flex-1 bg-transparent px-2 text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/40"
                  placeholder="#4f46e5"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-on-surface-variant">
                Cor secundária
              </label>
              <div className="flex h-11 items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-2 shadow-sm transition-colors focus-within:border-primary/50 focus-within:bg-card focus-within:ring-[3px] focus-within:ring-primary/10">
                <input type="color" className="h-7 w-8 cursor-pointer rounded bg-transparent border-0 p-0" {...register('corSecundaria')} />
                <input
                  {...register('corSecundaria')}
                  className="flex-1 bg-transparent px-2 text-[14px] text-on-surface outline-none placeholder:text-on-surface-variant/40"
                  placeholder="#7c3aed"
                />
              </div>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-[13px] font-semibold text-on-surface-variant">
                Frase de boas-vindas
              </label>
              <input
                {...register('fraseBemVindo')}
                className="w-full h-11 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40"
                placeholder="Bem-vindo! Vamos cuidar da sua contabilidade."
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-[13px] font-semibold text-on-surface-variant">
                Meta descrição (SEO)
              </label>
              <textarea
                {...register('metaDescricao')}
                rows={3}
                className="w-full resize-none rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
                placeholder="Contabilidade digital com IA para MEI, EPP e autônomos."
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col-reverse md:flex-row md:items-center justify-end gap-3 border-t border-outline-variant/15 pt-6">
          <button
            type="button"
            className="w-full md:w-auto rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            Cancelar
          </button>
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
