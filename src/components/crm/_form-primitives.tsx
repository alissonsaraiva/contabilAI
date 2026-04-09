'use client'

/* ────────────────────────────────────────────
 *  Primitivos de formulário compartilhados
 *  Importar em todos os drawers do CRM
 * ──────────────────────────────────────────── */

export const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
export const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'
export const SELECT = INPUT + ' appearance-none cursor-pointer pr-10'

/* ── Título de seção ── */

export function SectionTitle({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`space-y-1 pb-1 ${first ? '' : 'pt-2'}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/50">{children}</p>
    </div>
  )
}

/* ── Campo de input ── */

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

export function FormField({ label, required, error, children }: FormFieldProps) {
  return (
    <div>
      {label && (
        <label className={LABEL}>
          {label}
          {required && <span className="text-error"> *</span>}
        </label>
      )}
      {children}
      {error && <p className="mt-1.5 text-xs font-medium text-error">{error}</p>}
    </div>
  )
}

/* ── Select com chevron ── */

interface FormSelectProps {
  label: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}

export function FormSelect({ label, required, value, onChange, options, placeholder = '— Selecione —' }: FormSelectProps) {
  return (
    <FormField label={label} required={required}>
      <div className="relative">
        <select className={SELECT} value={value} onChange={e => onChange(e.target.value)}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/50">expand_more</span>
      </div>
    </FormField>
  )
}
