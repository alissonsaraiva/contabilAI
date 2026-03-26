'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type AssistenteState = {
  clienteId?: string
  leadId?: string
  nomeCliente: string
}

type AssistenteCtx = AssistenteState & {
  setContext: (s: AssistenteState) => void
  resetContext: () => void
}

const DEFAULT: AssistenteState = { nomeCliente: 'Escritório' }

const Ctx = createContext<AssistenteCtx>({
  ...DEFAULT,
  setContext: () => {},
  resetContext: () => {},
})

export function AssistenteProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AssistenteState>(DEFAULT)

  const setContext  = useCallback((s: AssistenteState) => setState(s), [])
  const resetContext = useCallback(() => setState(DEFAULT), [])

  return (
    <Ctx.Provider value={{ ...state, setContext, resetContext }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAssistente() {
  return useContext(Ctx)
}

// Componente invisível renderizado em páginas de detalhe para passar contexto
type SetterProps = {
  clienteId?: string
  leadId?: string
  nomeCliente: string
}

export function AssistenteContextSetter({ clienteId, leadId, nomeCliente }: SetterProps) {
  const { setContext, resetContext } = useAssistente()

  useEffect(() => {
    setContext({ clienteId, leadId, nomeCliente })
    return () => resetContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, leadId, nomeCliente])

  return null
}
