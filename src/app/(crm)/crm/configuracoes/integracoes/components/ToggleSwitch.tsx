'use client'

import { cn } from '@/lib/utils'

type Props = {
  label: string
  subtitle?: string
  checked: boolean
  onChange: (v: boolean) => void
  size?: 'sm' | 'md'
}

export function ToggleSwitch({ label, subtitle, checked, onChange, size = 'md' }: Props) {
  const isSm = size === 'sm'

  return (
    <div className={cn(
      'flex items-center justify-between',
      !isSm && 'rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-4',
    )}>
      {label && (
        <div>
          <p className={cn('font-semibold text-on-surface', isSm ? 'text-[12px]' : 'text-[13px]')}>{label}</p>
          {subtitle && <p className={cn('text-on-surface-variant/70', isSm ? 'text-[10px]' : 'text-[11px]')}>{subtitle}</p>}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex items-center rounded-full transition-colors shrink-0',
          checked ? 'bg-primary' : 'bg-outline-variant/40',
          isSm ? 'h-5 w-9' : 'h-6 w-11',
        )}
      >
        <span className={cn(
          'inline-block transform rounded-full bg-white shadow transition-transform',
          isSm
            ? cn('h-3.5 w-3.5', checked ? 'translate-x-4' : 'translate-x-0.5')
            : cn('h-4 w-4', checked ? 'translate-x-6' : 'translate-x-1'),
        )} />
      </button>
    </div>
  )
}
