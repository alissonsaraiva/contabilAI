'use client'

import { useEffect } from 'react'

export function SuppressThemeScriptWarning() {
  useEffect(() => {
    const original = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('Encountered a script tag while rendering React component')
      ) {
        return
      }
      original(...args)
    }
    return () => {
      console.error = original
    }
  }, [])
  return null
}
