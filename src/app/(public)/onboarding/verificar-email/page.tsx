'use client'

import { useState, use, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Props = { searchParams: Promise<{ leadId?: string; plano?: string; email?: string }> }

const INPUT = 'w-10 h-12 rounded-2xl border border-outline-variant/30 bg-white text-center text-[22px] font-bold text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 caret-transparent'

export default function VerificarEmailPage({ searchParams }: Props) {
  const { leadId, plano = '', email = '' } = use(searchParams)
  const router = useRouter()
  const [codigo, setCodigo] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [expiraEm, setExpiraEm] = useState<Date | null>(null)
  const [segundosRestantes, setSegundosRestantes] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Envia o código automaticamente ao carregar a página
  useEffect(() => {
    if (leadId && email) void enviarCodigo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Contador regressivo de expiração
  useEffect(() => {
    if (!expiraEm) return
    const tick = setInterval(() => {
      const diff = Math.max(0, Math.floor((expiraEm.getTime() - Date.now()) / 1000))
      setSegundosRestantes(diff)
      if (diff === 0) clearInterval(tick)
    }, 1000)
    return () => clearInterval(tick)
  }, [expiraEm])

  async function enviarCodigo() {
    if (!leadId || !email) return
    setEnviando(true)
    try {
      const res = await fetch('/api/onboarding/otp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, email }),
      })
      const data = await res.json() as { ok?: boolean; expiraEm?: string; error?: string }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao enviar código. Verifique seu e-mail e tente novamente.')
        return
      }
      if (data.expiraEm) setExpiraEm(new Date(data.expiraEm))
      setSegundosRestantes(600)
      toast.success('Código enviado! Verifique sua caixa de entrada.')
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  function handleDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const novo = [...codigo]
    novo[index] = digit
    setCodigo(novo)
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
    // Auto-verifica quando todos os 6 dígitos forem preenchidos
    if (digit && novo.every(d => d !== '')) {
      void verificar(novo.join(''))
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !codigo[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      e.preventDefault()
      const novo = pasted.split('')
      setCodigo(novo)
      inputRefs.current[5]?.focus()
      void verificar(pasted)
    }
  }

  async function verificar(codigoStr: string) {
    if (!leadId || codigoStr.length !== 6) return
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/otp/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, codigo: codigoStr }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Código incorreto. Tente novamente.')
        setCodigo(['', '', '', '', '', ''])
        inputRefs.current[0]?.focus()
        return
      }
      router.push(`/onboarding/revisao?leadId=${leadId}&plano=${plano}`)
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const emailMascarado = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => `${a}${'*'.repeat(Math.min(b.length, 4))}${c}`)
    : ''

  const podReenviar = segundosRestantes === 0 && !enviando

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center pt-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <span className="material-symbols-outlined text-[28px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            mark_email_read
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">Confirme seu e-mail</h1>
        <p className="mt-1.5 text-[14px] text-on-surface-variant">
          Enviamos um código de 6 dígitos para<br />
          <span className="font-semibold text-on-surface">{emailMascarado}</span>
        </p>
      </div>

      {/* Inputs OTP */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="flex justify-center gap-2 mb-4" onPaste={handlePaste}>
          {codigo.map((d, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el }}
              className={INPUT}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={loading}
              autoFocus={i === 0}
            />
          ))}
        </div>

        {segundosRestantes > 0 && (
          <p className="text-center text-[12px] text-on-surface-variant/60">
            Código expira em{' '}
            <span className="font-semibold text-on-surface-variant">
              {Math.floor(segundosRestantes / 60)}:{String(segundosRestantes % 60).padStart(2, '0')}
            </span>
          </p>
        )}
      </div>

      {/* Botão verificar manual */}
      <button
        onClick={() => verificar(codigo.join(''))}
        disabled={loading || codigo.some(d => d === '')}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <>Confirmar <span className="material-symbols-outlined text-[18px]">check_circle</span></>
        )}
      </button>

      {/* Reenviar */}
      <div className="text-center">
        <p className="text-[13px] text-on-surface-variant">
          Não recebeu?{' '}
          {podReenviar ? (
            <button
              onClick={enviarCodigo}
              className="font-semibold text-primary hover:underline"
            >
              Reenviar código
            </button>
          ) : (
            <span className="text-on-surface-variant/50">
              Aguarde {segundosRestantes}s para reenviar
            </span>
          )}
        </p>
        <p className="mt-1.5 text-[12px] text-on-surface-variant/60">
          Verifique também a pasta de spam
        </p>
      </div>

      {/* Voltar */}
      <button
        type="button"
        onClick={() => router.push(leadId ? `/onboarding/dados?leadId=${leadId}&plano=${plano}` : '/onboarding/dados')}
        className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        Corrigir e-mail
      </button>
    </div>
  )
}
