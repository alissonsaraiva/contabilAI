'use client'

import { cn } from '@/lib/utils'

type Props = {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
  labels?: { true: string; false: string }
}

export function BooleanRadio({ label, hint, value, onChange, labels }: Props) {
  const trueLabel = labels?.true ?? 'Sim'
  const falseLabel = labels?.false ?? 'Não'

  return (
    <div>
      <label className="block text-[13px] font-semibold text-on-surface-variant mb-2">{label}</label>
      <div className="flex items-center gap-3 h-11">
        {[{ v: true, l: trueLabel }, { v: false, l: falseLabel }].map(({ v, l }) => (
          <label key={String(v)} className={cn(
            'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors text-[13px] font-semibold',
            value === v ? 'border-primary/50 bg-primary/5 text-primary ring-2 ring-primary/20' : 'border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/40',
          )}>
            <input type="radio" checked={value === v} onChange={() => onChange(v)} className="accent-primary" />
            {l}
          </label>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-on-surface-variant/60">{hint}</p>}
    </div>
  )
}
