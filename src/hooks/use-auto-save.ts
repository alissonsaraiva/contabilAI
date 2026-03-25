'use client'

import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved'

export function useAutoSave(
  leadId: string | null | undefined,
  dataJson: string,
  delay = 1500,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef('')

  useEffect(() => {
    if (!leadId || dataJson === lastSaved.current) return
    if (timer.current) clearTimeout(timer.current)
    setStatus('saving')
    timer.current = setTimeout(async () => {
      try {
        await fetch(`/api/leads/${leadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: dataJson,
        })
        lastSaved.current = dataJson
        setStatus('saved')
      } catch {
        setStatus('idle')
      }
    }, delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [leadId, dataJson, delay])

  return status
}
