'use client'

/**
 * Hook para consulta de CNPJ.
 *
 * Uso:
 *   const { buscarCnpj, dados, loading, erro } = useCnpj()
 *
 *   // Em um onChange ou onBlur:
 *   const cnpjDigits = value.replace(/\D/g, '')
 *   if (cnpjDigits.length === 14) buscarCnpj(cnpjDigits)
 *
 * O resultado em `dados` pode ser usado para auto-preencher campos do formulário.
 */

import { useState, useCallback } from 'react'
import type { DadosCNPJ } from '@/lib/cnpj'

export type { DadosCNPJ }

export function useCnpj() {
  const [loading, setLoading] = useState(false)
  const [dados,   setDados]   = useState<DadosCNPJ | null>(null)
  const [erro,    setErro]    = useState<string | null>(null)

  const buscarCnpj = useCallback(async (cnpj: string): Promise<DadosCNPJ | null> => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) return null

    setLoading(true)
    setErro(null)
    try {
      const res = await fetch(`/api/cnpj/${digits}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        const msg  = body.error ?? 'CNPJ não encontrado'
        setErro(msg)
        setDados(null)
        return null
      }
      const d = await res.json() as DadosCNPJ
      setDados(d)
      return d
    } catch {
      setErro('Erro ao consultar CNPJ')
      setDados(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { buscarCnpj, dados, loading, erro }
}
