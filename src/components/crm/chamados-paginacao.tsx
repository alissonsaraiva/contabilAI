'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

type Props = {
  page:       number
  totalPages: number
  total:      number
  perPage:    number
}

export function ChamadosPaginacao({ page, totalPages, total, perPage }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const navigate = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.push(`${pathname}?${params.toString()}`)
  }

  const start = (page - 1) * perPage + 1
  const end   = Math.min(page * perPage, total)

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[13px] text-on-surface-variant">
        Exibindo{' '}
        <span className="font-semibold text-on-surface">{start}–{end}</span>
        {' '}de{' '}
        <span className="font-semibold text-on-surface">{total}</span> chamado{total !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(page - 1)}
          disabled={page <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
        <span className="min-w-[60px] text-center text-[13px] font-medium text-on-surface">
          {page} <span className="text-on-surface-variant">/ {totalPages}</span>
        </span>
        <button
          onClick={() => navigate(page + 1)}
          disabled={page >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>
    </div>
  )
}
