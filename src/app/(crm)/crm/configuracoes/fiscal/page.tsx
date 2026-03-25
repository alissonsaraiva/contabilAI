'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

const schema = z.object({
  cnpj: z.string().optional(),
  crc: z.string().optional(),
  contratoTemplate: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function FiscalPage() {
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
      toast.success('Dados fiscais salvos!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-outline-variant/15 bg-card p-8 shadow-sm">
      <div className="mb-8">
        <h2 className="font-headline text-lg font-semibold tracking-tight text-on-surface">Dados Fiscais</h2>
        <p className="mt-1 text-[13px] text-on-surface-variant/80">
          CNPJ, CRC e template de contrato do escritório.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-1.5">
            <label className={LABEL}>CNPJ</label>
            <input
              {...register('cnpj')}
              className={INPUT}
              placeholder="00.000.000/0001-00"
            />
          </div>

          <div className="space-y-1.5">
            <label className={LABEL}>CRC</label>
            <input
              {...register('crc')}
              className={INPUT}
              placeholder="CRC-SP 123456/O-4"
            />
          </div>

          <div className="col-span-2 space-y-1.5">
            <label className={LABEL}>Template de contrato</label>
            <p className="text-[12px] text-on-surface-variant/60 mb-2">
              Texto base do contrato de prestação de serviços. Variáveis disponíveis:{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[11px] font-mono">{'{{nomeCliente}}'}</code>,{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[11px] font-mono">{'{{plano}}'}</code>,{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[11px] font-mono">{'{{valor}}'}</code>
            </p>
            <textarea
              {...register('contratoTemplate')}
              rows={10}
              className="w-full resize-y rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] font-mono text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
              placeholder="CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS&#10;&#10;Por este instrumento particular, de um lado {{nomeEscritorio}}..."
            />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-outline-variant/15 pt-6">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60 min-w-[160px]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">save</span>}
            Salvar alterações
          </button>
        </div>
      </form>
    </div>
  )
}
