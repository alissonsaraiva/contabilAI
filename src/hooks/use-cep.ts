'use client'

/**
 * Hook para consulta de CEP via ViaCEP.
 *
 * Uso:
 *   const { buscarCep, loading } = useCep()
 *
 *   // Em um onChange:
 *   const digits = value.replace(/\D/g, '')
 *   if (digits.length === 8) buscarCep(digits, (dados) => {
 *     setForm(f => ({ ...f, logradouro: dados.logradouro, bairro: dados.bairro, cidade: dados.cidade, uf: dados.uf }))
 *   })
 */

import { useState, useCallback } from 'react'

export type DadosCEP = {
  logradouro: string
  bairro:     string
  cidade:     string
  uf:         string
  cep:        string
  ibge:       string | null
}

export function useCep() {
  const [loading, setLoading] = useState(false)

  const buscarCep = useCallback(async (
    cep: string,
    onSuccess?: (dados: DadosCEP) => void,
  ): Promise<DadosCEP | null> => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return null

    setLoading(true)
    try {
      const res = await fetch(`/api/validacoes/cep/${digits}`)
      if (!res.ok) return null
      const dados = await res.json() as DadosCEP
      onSuccess?.(dados)
      return dados
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { buscarCep, loading }
}
