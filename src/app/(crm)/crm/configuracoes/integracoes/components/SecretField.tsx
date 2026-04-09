'use client'

import type { UseFormRegisterReturn } from 'react-hook-form'
import { FieldLabel } from './FieldLabel'
import { INPUT } from './shared'

type Props = {
  label: string
  configured: boolean
  placeholder?: string
  hint?: string
} & (
  | { register: UseFormRegisterReturn; value?: never; onChange?: never }
  | { value: string; onChange: (v: string) => void; register?: never }
)

export function SecretField({ label, configured, placeholder, hint, ...rest }: Props) {
  const ph = configured
    ? (placeholder ?? 'Nova chave (deixe em branco para manter)')
    : (placeholder ?? '')

  return (
    <div>
      <FieldLabel label={label} configured={configured} />
      {'register' in rest && rest.register ? (
        <input
          {...rest.register}
          className={INPUT}
          placeholder={ph}
          type="password"
          autoComplete="off"
        />
      ) : (
        <input
          value={rest.value}
          onChange={e => rest.onChange?.(e.target.value)}
          className={INPUT}
          placeholder={ph}
          type="password"
          autoComplete="off"
        />
      )}
      {hint && <p className="mt-1 text-[11px] text-on-surface-variant/60">{hint}</p>}
    </div>
  )
}
