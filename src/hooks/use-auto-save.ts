'use client'

import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2000

async function salvarProgresso(leadId: string, dataJson: string, attempt = 0): Promise<void> {
  // Injeta leadId no payload (o dataJson vem do componente sem o leadId)
  const parsed = JSON.parse(dataJson) as Record<string, unknown>
  const body = JSON.stringify({ leadId, ...parsed })

  const res = await fetch('/api/onboarding/salvar-progresso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!res.ok) {
    if (attempt < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
      return salvarProgresso(leadId, dataJson, attempt + 1)
    }
    throw new Error(`Falha ao salvar (status ${res.status})`)
  }
}

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
        // O payload já contém o leadId dentro do dataJson (montado pela página)
        await salvarProgresso(leadId, dataJson)
        lastSaved.current = dataJson
        setStatus('saved')
      } catch {
        setStatus('error')
      }
    }, delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [leadId, dataJson, delay])

  return status
}
