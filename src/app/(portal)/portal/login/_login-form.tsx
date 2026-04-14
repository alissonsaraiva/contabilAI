'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const ERRO_LABELS: Record<string, string> = {
  email_nao_cadastrado:     'Não encontramos uma conta com esse e-mail. Verifique se digitou corretamente.',
  conta_inativa:            'Sua conta está inativa. Entre em contato com o escritório.',
  conta_suspensa:           'Seu acesso ao portal está temporariamente suspenso. Entre em contato com o escritório.',
  conta_cancelada:          'Sua conta foi cancelada. Entre em contato com o escritório.',
  empresa_nao_vinculada:    'Sua conta não está vinculada a uma empresa. Entre em contato com o escritório.',
  whatsapp_nao_cadastrado:  'Não há número de WhatsApp cadastrado nessa conta. Tente entrar pelo e-mail.',
  whatsapp_indisponivel:    'O envio pelo WhatsApp está indisponível no momento. Tente pelo e-mail.',
  whatsapp_falhou:          'Não foi possível enviar o código. Tente novamente.',
  codigo_invalido:          'Código incorreto ou expirado. Solicite um novo ou verifique sua caixa de entrada.',
  codigo_expirado:          'Seu código expirou. Solicite um novo para continuar.',
  token_invalido:           'Este link de acesso é inválido ou já foi utilizado. Solicite um novo abaixo.',
  token_expirado:           'Este link de acesso expirou. Solicite um novo abaixo.',
}

type Etapa  = 'email' | 'codigo'
type Canal  = 'email' | 'whatsapp'

function LoginFormInner({ nome, whatsappHabilitado }: { nome: string; whatsappHabilitado: boolean }) {
  const searchParams = useSearchParams()
  const [email, setEmail]         = useState('')
  const [telefone, setTelefone]   = useState('')
  const [otp, setOtp]             = useState('')
  const [etapa, setEtapa]         = useState<Etapa>('email')
  const [canal, setCanal]         = useState<Canal>('email')
  const [loadingEmail, setLoadingEmail]   = useState(false)
  const [loadingWpp, setLoadingWpp]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const otpInputRef = useRef<HTMLInputElement>(null)

  const erroParam = searchParams.get('erro')

  useEffect(() => {
    if (erroParam) toast.error(ERRO_LABELS[erroParam] ?? 'Ocorreu um erro. Tente novamente.')
  }, [erroParam])

  useEffect(() => {
    if (etapa === 'codigo') otpInputRef.current?.focus()
  }, [etapa])

  async function enviarCodigoEmail() {
    if (!email.trim()) return
    setLoadingEmail(true)
    try {
      const res = await fetch('/api/portal/magic-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim().toLowerCase() }),
      })

      if (res.ok) {
        setCanal('email')
        setEtapa('codigo')
      } else {
        const { error } = await res.json()
        toast.error(ERRO_LABELS[error] ?? 'Não foi possível enviar o código. Tente novamente.')
      }
    } finally {
      setLoadingEmail(false)
    }
  }

  async function enviarCodigoWhatsapp() {
    const tel = telefone.replace(/\D/g, '')
    if (tel.length < 8) return
    setLoadingWpp(true)
    try {
      const res = await fetch('/api/portal/otp/whatsapp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ telefone: tel }),
      })

      if (res.ok) {
        setCanal('whatsapp')
        setEtapa('codigo')
      } else {
        const { error } = await res.json()
        toast.error(ERRO_LABELS[error] ?? 'Não foi possível enviar o código. Tente novamente.')
      }
    } finally {
      setLoadingWpp(false)
    }
  }

  // Usado pelo botão "Reenviar código"
  async function reenviarCodigo() {
    if (canal === 'whatsapp') {
      await enviarCodigoWhatsapp()
    } else {
      await enviarCodigoEmail()
    }
  }

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== 6) return
    setLoadingEmail(true)
    try {
      const body = canal === 'whatsapp'
        ? { telefone: telefone.replace(/\D/g, ''), otp }
        : { email: email.trim().toLowerCase(), otp }

      const res = await fetch('/api/portal/otp/verificar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (res.ok) {
        window.location.replace('/portal/dashboard')
      } else {
        const { error } = await res.json()
        toast.error(ERRO_LABELS[error] ?? 'Código inválido. Tente novamente.')
        setOtp('')
        otpInputRef.current?.focus()
      }
    } finally {
      setLoadingEmail(false)
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    await signIn('google', { callbackUrl: '/portal/dashboard' })
  }

  // ─── Tela de verificação de código ──────────────────────────────────────────

  if (etapa === 'codigo') {
    const icone = canal === 'whatsapp' ? 'chat' : 'mark_email_read'
    const destino = canal === 'whatsapp'
      ? 'seu WhatsApp'
      : `${email}`

    return (
      <Card className="w-full max-w-[420px] border-outline-variant/15 bg-card/60 p-8 shadow-sm backdrop-blur-xl rounded-[20px]">
        <div className="text-center space-y-3 mb-7">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <span
              className="material-symbols-outlined text-[28px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              {icone}
            </span>
          </div>
          <h2 className="font-headline text-xl font-semibold text-on-surface">Código enviado!</h2>
          <p className="text-sm text-on-surface-variant">
            Enviamos um código de 6 dígitos para{' '}
            <span className="font-semibold text-on-surface">{destino}</span>.
          </p>
        </div>

        <form onSubmit={verificarCodigo} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-[13px] font-semibold text-on-surface-variant">
              Código de acesso
            </Label>
            <Input
              ref={otpInputRef}
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              className="h-14 rounded-xl border-outline-variant/30 bg-surface-container-low text-center text-2xl font-bold tracking-[.35em] shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:ring-[3px] focus:ring-primary/10"
            />
          </div>

          <Button
            type="submit"
            className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
            disabled={loadingEmail || otp.length !== 6}
          >
            {loadingEmail ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <span className="material-symbols-outlined mr-2 text-[18px]">lock_open</span>
            )}
            Verificar código
          </Button>
        </form>

        <div className="mt-5 flex flex-col items-center gap-2 text-sm">
          <button
            type="button"
            onClick={reenviarCodigo}
            className="font-semibold text-primary hover:underline"
          >
            Reenviar código
          </button>
          <button
            type="button"
            onClick={() => { setEtapa('email'); setOtp('') }}
            className="text-on-surface-variant/60 hover:text-on-surface-variant"
          >
            Voltar ao login
          </button>
        </div>
      </Card>
    )
  }

  // ─── Tela de entrada ─────────────────────────────────────────────────────────

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

        {/* Divider principal */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-outline-variant/30" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-xs text-on-surface-variant/50">
              ou entre com um código
            </span>
          </div>
        </div>

        {/* ── Seção e-mail ── */}
        <div className="space-y-3">
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
              onKeyDown={e => e.key === 'Enter' && enviarCodigoEmail()}
              autoFocus
              className="h-11 rounded-xl border-outline-variant/30 bg-surface-container-low text-[14px] shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:ring-[3px] focus:ring-primary/10"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl border-outline-variant/40 text-sm font-semibold gap-2"
            disabled={loadingEmail || !email.trim()}
            onClick={enviarCodigoEmail}
          >
            {loadingEmail ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-[18px]">mail</span>
            )}
            Enviar código por e-mail
          </Button>
        </div>

        {/* ── Seção WhatsApp (se habilitado) ── */}
        {whatsappHabilitado && (
          <>
            {/* Divider OU */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant/30" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-xs text-on-surface-variant/50">ou</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="telefone" className="text-[13px] font-semibold text-on-surface-variant">
                  WhatsApp cadastrado
                </Label>
                <Input
                  id="telefone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && enviarCodigoWhatsapp()}
                  className="h-11 rounded-xl border-outline-variant/30 bg-surface-container-low text-[14px] shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:ring-[3px] focus:ring-primary/10"
                />
              </div>

              <Button
                type="button"
                className="h-11 w-full rounded-xl text-sm font-semibold shadow-sm gap-2"
                disabled={loadingWpp || telefone.replace(/\D/g, '').length < 8}
                onClick={enviarCodigoWhatsapp}
              >
                {loadingWpp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                )}
                Receber código no WhatsApp
              </Button>
            </div>
          </>
        )}
      </Card>

      <p className="mt-8 text-center text-[11px] font-medium uppercase tracking-wider text-on-surface-variant/40">
        © {new Date().getFullYear()} {nome} — Área exclusiva para clientes
      </p>
    </div>
  )
}

export function PortalLoginForm({ nome, whatsappHabilitado }: { nome: string; whatsappHabilitado: boolean }) {
  return (
    <Suspense fallback={
      <div className="w-full max-w-[420px] rounded-[20px] border border-outline-variant/15 bg-card/60 p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }>
      <LoginFormInner nome={nome} whatsappHabilitado={whatsappHabilitado} />
    </Suspense>
  )
}
