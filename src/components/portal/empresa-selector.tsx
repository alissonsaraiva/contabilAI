'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Empresa = { id: string; label: string }

type Props = {
  empresas: Empresa[]
  empresaAtiva: string
}

export function EmpresaSelector({ empresas, empresaAtiva }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState(empresaAtiva)

  if (empresas.length <= 1) return null

  async function trocar(novaEmpresaId: string) {
    const anterior = value
    setValue(novaEmpresaId)
    try {
      const res = await fetch('/api/portal/empresa/trocar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId: novaEmpresaId }),
      })
      if (res.ok) {
        startTransition(() => router.refresh())
      } else {
        setValue(anterior)
      }
    } catch {
      setValue(anterior)
    }
  }

  return (
    <select
      value={value}
      onChange={(e) => trocar(e.target.value)}
      disabled={isPending}
      className="rounded-md border border-outline-variant/30 bg-surface-container-low px-2 py-1 text-[12px] font-medium text-on-surface max-w-[200px] truncate disabled:opacity-50"
    >
      {empresas.map((emp) => (
        <option key={emp.id} value={emp.id}>{emp.label}</option>
      ))}
    </select>
  )
}
