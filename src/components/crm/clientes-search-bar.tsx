'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export function ClientesSearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set('q', value)
      } else {
        params.delete('q')
      }
      params.delete('page')
      router.push(`${pathname}?${params.toString()}`)
    }, 400)
    return () => clearTimeout(timer)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative max-w-sm">
      <span
        className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50"
      >
        search
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por nome, e-mail ou CPF…"
        className="h-9 w-full rounded-lg border border-outline-variant/20 bg-surface-container-low/50 pl-9 pr-8 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
      />
      {value && (
        <button
          onClick={() => setValue('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}
    </div>
  )
}
