'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const INPUT = 'w-full rounded-xl border border-transparent bg-surface-container-lowest/80 px-4 py-3 text-[14px] font-medium text-on-surface shadow-sm placeholder:text-on-surface-variant/40 transition-all hover:bg-surface-container-lowest focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/5'
const LABEL = 'block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2'
const HINT = 'mt-1 text-[11px] text-on-surface-variant/60'

const schema = z.object({
  multaPercent: z.number().min(0).max(100).optional(),
  jurosMesPercent: z.number().min(0).max(100).optional(),
  diasAtrasoMulta: z.number().int().min(1).optional(),
  diasInadimplenciaRescisao: z.number().int().min(1).optional(),
  diasAvisoRescisao: z.number().int().min(1).optional(),
  diasDocumentosAntecedencia: z.number().int().min(1).optional(),
  pixDescontoPercent: z.number().min(0).max(100).optional(),
  vencimentosDiasRaw: z.string().optional(),
  contratoTemplate: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function ContratoPage() {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, reset } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    void fetch('/api/escritorio')
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (!data) return
        reset({
          multaPercent: (data.multaPercent as number) ?? 2.0,
          jurosMesPercent: (data.jurosMesPercent as number) ?? 1.0,
          diasAtrasoMulta: (data.diasAtrasoMulta as number) ?? 15,
          diasInadimplenciaRescisao: (data.diasInadimplenciaRescisao as number) ?? 60,
          diasAvisoRescisao: (data.diasAvisoRescisao as number) ?? 30,
          diasDocumentosAntecedencia: (data.diasDocumentosAntecedencia as number) ?? 5,
          pixDescontoPercent: (data.pixDescontoPercent as number) ?? 5.0,
          contratoTemplate: (data.contratoTemplate as string) ?? '',
          vencimentosDiasRaw: Array.isArray(data.vencimentosDias)
            ? (data.vencimentosDias as number[]).join(', ')
            : '5, 10, 15, 20',
        })
      })
  }, [reset])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
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
      toast.success('Configurações de contrato salvas!')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-card p-4 md:p-8 shadow-sm">
      <div className="mb-8">
        <h2 className="font-headline text-[24px] font-semibold tracking-tight text-on-surface">Contrato de Prestação de Serviços</h2>
        <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/70">
          Termos contratuais, condições de pagamento e template do contrato gerado no onboarding.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

        {/* Termos contratuais */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-4">Termos do Contrato</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className={LABEL}>Multa por atraso (%)</label>
              <input
                {...register('multaPercent', { valueAsNumber: true })}
                type="number"
                step="0.5"
                min="0"
                max="100"
                className={INPUT}
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
                className={INPUT}
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
                className={INPUT}
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
                className={INPUT}
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
                className={INPUT}
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
                className={INPUT}
                placeholder="5"
              />
              <p className={HINT}>Cliente envia docs com X dias de antecedência</p>
            </div>
          </div>
        </div>

        {/* Condições de pagamento */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-4">Condições de Pagamento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div className="space-y-1.5">
              <label className={LABEL}>Desconto PIX (%)</label>
              <input
                {...register('pixDescontoPercent', { valueAsNumber: true })}
                type="number"
                step="0.5"
                min="0"
                max="100"
                className={INPUT}
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
              <p className={HINT}>Separados por vírgula. O cliente escolhe um durante o onboarding.</p>
            </div>
          </div>
        </div>

        {/* Template de contrato */}
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/60 mb-4">Template de Contrato</h3>
          <div className="space-y-3">
            <p className="text-[12px] text-on-surface-variant/60">
              Texto base opcional. Deixe em branco para usar o contrato padrão. Use as variáveis abaixo — elas são substituídas automaticamente ao gerar o contrato.
            </p>
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50 mb-3">Variáveis do cliente</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[
                  ['{{nomeCliente}}', 'Nome completo'],
                  ['{{cpf}}', 'CPF'],
                  ['{{rg}}', 'RG'],
                  ['{{email}}', 'E-mail'],
                  ['{{telefone}}', 'Telefone'],
                  ['{{cnpj}}', 'CNPJ'],
                  ['{{razaoSocial}}', 'Razão Social'],
                  ['{{nomeFantasia}}', 'Nome Fantasia'],
                  ['{{logradouro}}', 'Logradouro'],
                  ['{{numero}}', 'Número'],
                  ['{{complemento}}', 'Complemento'],
                  ['{{bairro}}', 'Bairro'],
                  ['{{cidade}}', 'Cidade'],
                  ['{{uf}}', 'Estado'],
                  ['{{cep}}', 'CEP'],
                ].map(([v, label]) => (
                  <span key={v} title={label} className="inline-flex items-center gap-1 rounded bg-surface-container px-1.5 py-0.5 text-[11px] font-mono text-on-surface/70 cursor-default border border-outline-variant/20">
                    {v}
                  </span>
                ))}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50 mb-3">Variáveis do contrato</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[
                  ['{{plano}}', 'Plano contratado'],
                  ['{{valor}}', 'Valor mensal'],
                  ['{{vencimento}}', 'Dia de vencimento'],
                  ['{{formaPagamento}}', 'Forma de pagamento'],
                  ['{{dataContrato}}', 'Data do contrato'],
                ].map(([v, label]) => (
                  <span key={v} title={label} className="inline-flex items-center gap-1 rounded bg-surface-container px-1.5 py-0.5 text-[11px] font-mono text-on-surface/70 cursor-default border border-outline-variant/20">
                    {v}
                  </span>
                ))}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50 mb-3">Variáveis do escritório</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['{{escritorioNome}}', 'Nome do escritório'],
                  ['{{escritorioCnpj}}', 'CNPJ do escritório'],
                  ['{{escritorioCrc}}', 'CRC'],
                  ['{{escritorioCidade}}', 'Cidade do escritório'],
                  ['{{escritorioEndereco}}', 'Endereço completo do escritório'],
                ].map(([v, label]) => (
                  <span key={v} title={label} className="inline-flex items-center gap-1 rounded bg-surface-container px-1.5 py-0.5 text-[11px] font-mono text-on-surface/70 cursor-default border border-outline-variant/20">
                    {v}
                  </span>
                ))}
              </div>
            </div>
            <textarea
              {...register('contratoTemplate')}
              rows={12}
              className="w-full resize-y rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] font-mono text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40 custom-scrollbar"
              placeholder="Deixe em branco para usar o contrato padrão gerado automaticamente."
            />
          </div>
        </div>

        <div className="flex flex-col-reverse md:flex-row md:items-center justify-end gap-3 border-t border-outline-variant/15 pt-6">
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
