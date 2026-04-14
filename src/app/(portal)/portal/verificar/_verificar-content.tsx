'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'

type Estado = 'verificando' | 'ok' | 'erro'

const ERRO_MSG: Record<string, string> = {
  token_invalido: 'Este link de acesso é inválido ou já foi utilizado. Solicite um novo abaixo.',
  token_expirado: 'Este link de acesso expirou. Solicite um novo abaixo.',
  conta_inativa:  'Sua conta está inativa. Entre em contato com o escritório.',
}

function VerificarContentInner() {
  const searchParams = useSearchParams()
  const [estado, setEstado]   = useState<Estado>('verificando')
  const [erroMsg, setErroMsg] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setErroMsg(ERRO_MSG['token_invalido']!)
      setEstado('erro')
      return
    }

    async function verificar() {
      try {
        const res = await fetch(`/api/portal/verificar?token=${encodeURIComponent(token!)}`)
        if (!res.ok) {
          const { error } = await res.json()
          setErroMsg(ERRO_MSG[error] ?? 'Ocorreu um erro. Tente novamente.')
          setEstado('erro')
          return
        }

        const { id, nome, email, tipo, empresaId } = await res.json()

        const result = await signIn('portal-token', {
          id,
          nome,
          email,
          tipo,
          empresaId,
          redirect: false,
        })

        if (result?.error) {
          setErroMsg('Não foi possível iniciar sua sessão. Tente novamente.')
          setEstado('erro')
          return
        }

        setEstado('ok')
        window.location.replace('/portal/dashboard')
      } catch {
        setErroMsg('Ocorreu um erro inesperado. Tente novamente.')
        setEstado('erro')
      }
    }

    void verificar()
  }, [searchParams])

  return (
    <div className="w-full max-w-[420px] rounded-[20px] border border-outline-variant/15 bg-card/60 p-8 text-center shadow-sm backdrop-blur-xl">
      {estado === 'verificando' && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-on-surface-variant">Verificando seu acesso…</p>
        </div>
      )}

      {estado === 'ok' && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-status/10">
            <span className="material-symbols-outlined text-[28px] text-green-status" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <p className="text-sm font-medium text-on-surface-variant">Acesso confirmado! Redirecionando…</p>
        </div>
      )}

      {estado === 'erro' && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-error/10">
            <span className="material-symbols-outlined text-[28px] text-error" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
          </div>
          <h2 className="font-headline text-lg font-semibold text-on-surface">Link inválido</h2>
          <p className="text-sm text-on-surface-variant">{erroMsg}</p>
          <Link
            href="/portal/login"
            className="mt-2 flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            Voltar para o login
          </Link>
        </div>
      )}
    </div>
  )
}

export function VerificarContent() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-[420px] rounded-[20px] border border-outline-variant/15 bg-card/60 p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }>
      <VerificarContentInner />
    </Suspense>
  )
}
