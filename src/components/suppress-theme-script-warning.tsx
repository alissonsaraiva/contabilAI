'use client'

// Override em nível de módulo — roda antes de qualquer render/hydration,
// evitando o overlay de dev do Next.js causado pelo next-themes injetar <script>.
if (typeof console !== 'undefined') {
  const _orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Encountered a script tag')) return
    _orig(...args)
  }
}

export function SuppressThemeScriptWarning() {
  return null
}
