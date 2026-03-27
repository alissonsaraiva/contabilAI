'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const ERRO_LABELS: Record<string, string> = {
  email_nao_cadastrado: 'Nenhuma conta encontrada com esse e-mail. Use o e-mail que você cadastrou no onboarding ou tente o link de acesso.',
  conta_inativa:        'Sua conta está inativa. Entre em contato com o escritório.',
  conta_suspensa:       'Seu acesso ao portal está temporariamente suspenso. Entre em contato com o escritório para regularizar.',
  conta_cancelada:      'Sua conta foi cancelada. Se deseja reativar os serviços, entre em contato com o escritório.',
  token_invalido:       'Link de acesso inválido ou expirado. Solicite um novo abaixo.',
  token_expirado:       'Este link de acesso expirou. Solicite um novo abaixo.',
}

// Componente interno que usa useSearchParams — precisa de Suspense no pai
function LoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [enviado, setEnviado]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const erroParam = searchParams.get('erro')

  useEffect(() => {
    if (erroParam) toast.error(ERRO_LABELS[erroParam] ?? 'Ocorreu um erro. Tente novamente.')
  }, [erroParam])

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/portal/magic-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      if (res.ok) {
        setEnviado(true)
      } else {
        const { error } = await res.json()
        toast.error(ERRO_LABELS[error] ?? 'Não foi possível enviar o link. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    await signIn('google', { callbackUrl: '/portal/dashboard' })
  }

  if (enviado) {
    return (
      <Card className="w-full max-w-[420px] border-outline-variant/15 bg-card/60 p-8 shadow-sm backdrop-blur-xl rounded-[20px] text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <span className="material-symbols-outlined text-[28px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
        </div>
        <h2 className="font-headline text-xl font-semibold text-on-surface">Link enviado!</h2>
        <p className="text-sm text-on-surface-variant">
          Enviamos um link de acesso para <span className="font-semibold text-on-surface">{email}</span>.
          Verifique sua caixa de entrada e clique no link para entrar.
        </p>
        <p className="text-xs text-on-surface-variant/60">O link expira em 30 minutos. Não compartilhe com ninguém.</p>
        <button
          onClick={() => setEnviado(false)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Usar outro e-mail
        </button>
      </Card>
    )
  }

  return (
    <div className="w-full max-w-[420px]">
      <Card className="border-outline-variant/15 bg-card/60 p-6 sm:p-8 shadow-sm backdrop-blur-xl rounded-[20px]">
        <div className="mb-7 text-center space-y-1.5">
          <h1 className="font-headline text-2xl font-semibold tracking-tight text-on-surface">Portal do Cliente</h1>
          <p className="text-sm text-on-surface-variant/80">Acesse sua área exclusiva</p>
        </div>

        {/* Google OAuth */}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl border-outline-variant/40 text-sm font-semibold gap-2 mb-6"
          onClick={handleGoogle}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          Entrar com Google
        </Button>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant/30" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-xs text-on-surface-variant/50">ou receba um link por e-mail</span>
          </div>
        </div>

        {/* Magic link form */}
        <form onSubmit={handleMagicLink} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[13px] font-semibold text-on-surface-variant">
              E-mail cadastrado
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com.br"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="h-11 rounded-xl border-outline-variant/30 bg-surface-container-low text-[14px] shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:ring-[3px] focus:ring-primary/10"
            />
          </div>

          <Button
            type="submit"
            className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
            disabled={loading || !email.trim()}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <span className="material-symbols-outlined mr-2 text-[18px]">send</span>
            )}
            Enviar link de acesso
          </Button>
        </form>
      </Card>

      <p className="mt-8 text-center text-[11px] font-medium uppercase tracking-wider text-on-surface-variant/40">
        © {new Date().getFullYear()} ContabAI — Área exclusiva para clientes
      </p>
    </div>
  )
}

export default function PortalLoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>calculate</span>
        </div>
        <span className="font-headline text-2xl font-bold tracking-tight text-on-surface">ContabAI</span>
      </div>
      <Suspense fallback={
        <div className="w-full max-w-[420px] rounded-[20px] border border-outline-variant/15 bg-card/60 p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  )
}
