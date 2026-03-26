'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatCNPJ } from '@/lib/utils'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const INPUT_SM = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
const HINT = 'mt-1 text-[11px] text-on-surface-variant/60'

const schema = z.object({
  cnpj:                        z.string().optional(),
  crc:                         z.string().optional(),
  contratoTemplate:            z.string().optional(),
  multaPercent:                z.number().min(0).max(100).optional(),
  jurosMesPercent:             z.number().min(0).max(100).optional(),
  diasAtrasoMulta:             z.number().int().min(1).optional(),
  diasInadimplenciaRescisao:   z.number().int().min(1).optional(),
  diasAvisoRescisao:           z.number().int().min(1).optional(),
  diasDocumentosAntecedencia:  z.number().int().min(1).optional(),
  vencimentosDiasRaw:          z.string().optional(),
  pixDescontoPercent:          z.number().min(0).max(100).optional(),
})

type FormData = z.infer<typeof schema>

export default function FiscalPage() {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, reset, setValue, watch } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    fetch('/api/escritorio')
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (!data) return
        reset({
          cnpj:                       data.cnpj as string ?? '',
          crc:                        data.crc as string ?? '',
          contratoTemplate:           data.contratoTemplate as string ?? '',
          multaPercent:               (data.multaPercent as number) ?? 2.0,
          jurosMesPercent:            (data.jurosMesPercent as number) ?? 1.0,
          diasAtrasoMulta:            (data.diasAtrasoMulta as number) ?? 15,
          diasInadimplenciaRescisao:  (data.diasInadimplenciaRescisao as number) ?? 60,
          diasAvisoRescisao:          (data.diasAvisoRescisao as number) ?? 30,
          diasDocumentosAntecedencia: (data.diasDocumentosAntecedencia as number) ?? 5,
          pixDescontoPercent:         (data.pixDescontoPercent as number) ?? 5.0,
          vencimentosDiasRaw:         Array.isArray(data.vencimentosDias)
            ? (data.vencimentosDias as number[]).join(', ')
            : '5, 10, 15, 20',
        })
      })
  }, [reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      // Converte "5, 10, 15, 20" → [5, 10, 15, 20]
      const vencimentosDias = (data.vencimentosDiasRaw ?? '')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n >= 1 && n <= 31)

      const { vencimentosDiasRaw: _, ...rest } = data

      const res = await fetch('/api/escritorio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rest, vencimentosDias }),
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
        <h2 className="font-headline text-lg font-semibold tracking-tight text-on-surface">Dados Fiscais & Contratuais</h2>
        <p className="mt-1 text-[13px] text-on-surface-variant/80">
          CNPJ, CRC, termos do contrato e condições de pagamento.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

        {/* Dados fiscais */}
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant mb-4">Registro</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className={LABEL}>CNPJ</label>
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
              <label className={LABEL}>CRC</label>
              <input
                {...register('crc')}
                className={INPUT}
                placeholder="CRC-SP 123456/O-4"
                maxLength={20}
              />
            </div>
          </div>
        </div>

        {/* Termos contratuais */}
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant mb-4">Termos do Contrato</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className={LABEL}>Multa por atraso (%)</label>
              <input
                {...register('multaPercent', { valueAsNumber: true })}
                type="number"
                step="0.5"
                min="0"
                max="100"
                className={INPUT_SM}
                placeholder="2"
              />
              <p className={HINT}>Ex: 2 = multa de 2%</p>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Juros ao mês (%)</label>
              <input
                {...register('jurosMesPercent', { valueAsNumber: true })}
                type="number"
                step="0.5"
                min="0"
                max="100"
                className={INPUT_SM}
                placeholder="1"
              />
              <p className={HINT}>Ex: 1 = 1% ao mês</p>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Dias até cobrar multa</label>
              <input
                {...register('diasAtrasoMulta', { valueAsNumber: true })}
                type="number"
                min="1"
                className={INPUT_SM}
                placeholder="15"
              />
              <p className={HINT}>Dias de atraso antes da multa</p>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Dias para rescisão (inadimplência)</label>
              <input
                {...register('diasInadimplenciaRescisao', { valueAsNumber: true })}
                type="number"
                min="1"
                className={INPUT_SM}
                placeholder="60"
              />
              <p className={HINT}>Após este período, contrato rescinde</p>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Aviso prévio de rescisão (dias)</label>
              <input
                {...register('diasAvisoRescisao', { valueAsNumber: true })}
                type="number"
                min="1"
                className={INPUT_SM}
                placeholder="30"
              />
              <p className={HINT}>Prazo para cancelamento voluntário</p>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Antecedência de documentos (dias úteis)</label>
              <input
                {...register('diasDocumentosAntecedencia', { valueAsNumber: true })}
                type="number"
                min="1"
                className={INPUT_SM}
                placeholder="5"
              />
              <p className={HINT}>Cliente deve enviar documentos com X dias de antecedência</p>
            </div>
          </div>
        </div>

        {/* Condições de pagamento */}
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant mb-4">Condições de Pagamento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className={LABEL}>Desconto PIX (%)</label>
              <input
                {...register('pixDescontoPercent', { valueAsNumber: true })}
                type="number"
                step="0.5"
                min="0"
                max="100"
                className={INPUT_SM}
                placeholder="5"
              />
              <p className={HINT}>Desconto exibido no onboarding para pagamento via PIX</p>
            </div>
            <div className="space-y-1.5">
              <label className={LABEL}>Dias de vencimento disponíveis</label>
              <input
                {...register('vencimentosDiasRaw')}
                className={INPUT}
                placeholder="5, 10, 15, 20"
              />
              <p className={HINT}>Dias separados por vírgula (ex: 5, 10, 15, 20). O cliente escolhe um durante o onboarding.</p>
            </div>
          </div>
        </div>

        {/* Template de contrato */}
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant mb-4">Template de Contrato</h3>
          <div className="space-y-1.5">
            <p className="text-[12px] text-on-surface-variant/60 mb-2">
              Texto base opcional. Variáveis:{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[11px] font-mono">{'{{nomeCliente}}'}</code>{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[11px] font-mono">{'{{plano}}'}</code>{' '}
              <code className="rounded bg-surface-container px-1 py-0.5 text-[11px] font-mono">{'{{valor}}'}</code>
            </p>
            <textarea
              {...register('contratoTemplate')}
              rows={8}
              className="w-full resize-y rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] font-mono text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
              placeholder="Deixe em branco para usar o contrato padrão gerado automaticamente."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 pt-6">
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
