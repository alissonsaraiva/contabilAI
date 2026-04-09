'use client'

import { cn } from '@/lib/utils'
import type { UseFormRegisterReturn } from 'react-hook-form'

export type RadioOption = {
  value: string
  label: string
  sub?: string
  icon?: string
}

type Props = {
  options: RadioOption[]
  selected: string | undefined
  label?: string
  cols?: 2 | 3
} & (
  | { register: UseFormRegisterReturn; onChange?: never }
  | { onChange: (value: string) => void; register?: never }
)

export function RadioOptionGroup({ options, selected, label, cols = 2, ...rest }: Props) {
  const allHaveSub = options.every(o => !!o.sub)

  return (
    <div>
      {label && <label className="mb-2 block text-[13px] font-semibold text-on-surface-variant">{label}</label>}
      <div className={cn('grid gap-3', cols === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map(opt => (
          <label
            key={opt.value}
            className={cn(
              'flex cursor-pointer gap-2 rounded-xl border p-3 transition-colors',
              allHaveSub ? 'items-start' : 'items-center',
              cols === 2 && 'gap-3 p-4',
              selected === opt.value
                ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                : 'border-outline-variant/20 hover:border-outline-variant/40',
            )}
          >
            {'register' in rest && rest.register ? (
              <input type="radio" value={opt.value} {...rest.register} className={cn('accent-primary shrink-0', allHaveSub && 'mt-0.5')} />
            ) : (
              <input type="radio" checked={selected === opt.value} onChange={() => rest.onChange?.(opt.value)} className={cn('accent-primary shrink-0', allHaveSub && 'mt-0.5')} />
            )}
            {opt.icon && (
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>{opt.icon}</span>
            )}
            <div>
              <p className={cn('text-[13px] font-semibold', selected === opt.value ? 'text-primary' : 'text-on-surface')}>
                {opt.label}
              </p>
              {opt.sub && <p className="text-[11px] text-on-surface-variant/70">{opt.sub}</p>}
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
