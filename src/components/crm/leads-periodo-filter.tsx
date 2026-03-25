'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const OPCOES = [
  { label: '7 dias', value: '7d' },
  { label: '30 dias', value: '30d' },
  { label: '90 dias', value: '90d' },
  { label: 'Todos', value: 'todos' },
]

export function LeadsPeriodoFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const atual = searchParams.get('periodo') ?? '30d'

  function set(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('periodo', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-outline-variant/20 bg-surface-container-low/60 p-1">
      {OPCOES.map((op) => (
        <button
          key={op.value}
          onClick={() => set(op.value)}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all ${
            atual === op.value
              ? 'bg-primary text-white shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {op.label}
        </button>
      ))}
    </div>
  )
}
