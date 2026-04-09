'use client'

export function FieldLabel({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-[13px] font-semibold text-on-surface-variant">{label}</label>
      {configured && (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-green-600">
          <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          Configurado
        </span>
      )}
    </div>
  )
}
