'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

type Estado = 'verificando' | 'ok' | 'erro'

const ERRO_MSG: Record<string, string> = {
  token_invalido: 'Este link de acesso é inválido ou já foi utilizado.',
  token_expirado: 'Este link de acesso expirou. Solicite um novo abaixo.',
  conta_inativa:  'Sua conta está inativa. Entre em contato com o escritório.',
}

export default function PortalVerificarPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const [estado, setEstado] = useState<Estado>('verificando')
  const [erroMsg, setErroMsg] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setErroMsg(ERRO_MSG.token_invalido)
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

        const { clienteId, nome, email } = await res.json()

        const result = await signIn('portal-token', {
          clienteId,
          nome,
          email,
          redirect: false,
        })

        if (result?.error) {
          setErroMsg('Não foi possível criar sua sessão. Tente novamente.')
          setEstado('erro')
          return
        }

        setEstado('ok')
        router.replace('/portal/dashboard')
      } catch {
        setErroMsg('Ocorreu um erro inesperado. Tente novamente.')
        setEstado('erro')
      }
    }

    verificar()
  }, [searchParams, router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>calculate</span>
        </div>
        <span className="font-headline text-2xl font-bold tracking-tight text-on-surface">ContabAI</span>
      </div>

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
            <Button asChild className="mt-2 h-10 w-full rounded-xl text-sm font-semibold">
              <Link href="/portal/login">Voltar para o login</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
