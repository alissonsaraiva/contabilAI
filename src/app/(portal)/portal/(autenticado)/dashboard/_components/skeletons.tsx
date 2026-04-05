export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm overflow-hidden animate-pulse">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-outline-variant/10 p-4 sm:px-5 sm:py-4">
        <div className="h-5 w-5 rounded-full bg-surface-container-high" />
        <div className="h-3.5 w-32 rounded-md bg-surface-container-high" />
      </div>
      {/* rows */}
      <div className="divide-y divide-outline-variant/8">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <div className="h-3 flex-1 rounded-md bg-surface-container-high" />
            <div className="h-3 w-16 rounded-md bg-surface-container-high" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function CardSmallSkeleton() {
  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm p-4 sm:p-5 animate-pulse">
      <div className="mb-4 h-3 w-24 rounded-md bg-surface-container-high" />
      <div className="space-y-3">
        <div className="h-7 w-28 rounded-md bg-surface-container-high" />
        <div className="h-3 w-40 rounded-md bg-surface-container-high" />
        <div className="mt-3 h-9 w-full rounded-xl bg-surface-container-high" />
      </div>
    </div>
  )
}

export function CardResumoSkeleton() {
  return (
    <div className="rounded-[16px] border border-outline-variant/15 bg-card shadow-sm p-4 sm:p-5 animate-pulse">
      <div className="mb-4 h-3.5 w-28 rounded-md bg-surface-container-high" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface-container-high p-3 text-center">
            <div className="mx-auto mb-2 h-6 w-10 rounded-md bg-surface-container" />
            <div className="mx-auto h-2.5 w-16 rounded-md bg-surface-container" />
          </div>
        ))}
      </div>
    </div>
  )
}
