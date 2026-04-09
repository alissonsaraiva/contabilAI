'use client'

import { useState } from 'react'
import type { UseFormRegister } from 'react-hook-form'
import type { FormData, ApiStatus } from '../types'
import { INPUT, LABEL } from '../styles'

export function KeyField({
  label, description, placeholder, fieldName, status, register,
}: {
  label: string
  description: string
  placeholder: string
  fieldName: keyof FormData
  status?: ApiStatus
  register: UseFormRegister<FormData>
}) {
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className={LABEL}>{label}</label>
        {status?.configured && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-status">
            <span className="material-symbols-outlined text-[13px]">check_circle</span>
            Configurada
          </span>
        )}
      </div>
      {status?.configured && (
        <p className="font-mono text-[11px] text-on-surface-variant/60 mb-1">{status.masked}</p>
      )}
      <div className="relative">
        <input
          {...register(fieldName)}
          type={show ? 'text' : 'password'}
          className={`${INPUT} pr-10`}
          placeholder={status?.configured ? 'Nova chave (deixe em branco para manter)' : placeholder}
          autoComplete="off"
        />
        <button
          type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">{show ? 'visibility_off' : 'visibility'}</span>
        </button>
      </div>
      <p className="text-[11px] text-on-surface-variant/60">{description}</p>
    </div>
  )
}
