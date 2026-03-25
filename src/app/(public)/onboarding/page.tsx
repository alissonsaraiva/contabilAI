'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

const INPUT = 'w-full h-12 rounded-2xl border border-outline-variant/30 bg-white px-4 text-[15px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function isPhone(v: string) {
  return /^[\d\s()\-+]+$/.test(v) && !/[@a-zA-Z]/.test(v)
}

export default function OnboardingEntrada() {
  const router = useRouter()
  const [contato, setContato] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  function handleChange(v: string) {
    if (isPhone(v) && v.length > 0) {
      setContato(maskPhone(v))
    } else {
      setContato(v)
    }
    setErro('')
  }

  function validate() {
    const isEmail = /\S+@\S+\.\S+/.test(contato)
    const isPhone = /^\d{10,11}$/.test(contato.replace(/\D/g, ''))
    if (!isEmail && !isPhone) {
      setErro('Informe um e-mail ou WhatsApp válido')
      return false
    }
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contatoEntrada: contato.trim(), canal: 'site' }),
      })
      if (!res.ok) throw new Error()
      const lead = await res.json()
      router.push(`/onboarding/simulador?leadId=${lead.id}`)
    } catch {
      toast.error('Erro ao iniciar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <div className="text-center pt-4">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-sm">
          <span className="material-symbols-outlined text-[32px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            waving_hand
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">
          Vamos começar!
        </h1>
        <p className="mt-2 text-[15px] text-on-surface-variant leading-relaxed">
          Em 2 minutos você terá uma recomendação personalizada de plano contábil.
        </p>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-outline-variant/15 bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-[17px] font-semibold text-on-surface">Seu contato</h2>
          <p className="mt-1 text-[13px] text-on-surface-variant">
            Informe seu e-mail ou WhatsApp para continuarmos
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant/50">
                alternate_email
              </span>
              <input
                className={INPUT + ' pl-11'}
                type="text"
                placeholder="seu@email.com ou (85) 99999-9999"
                value={contato}
                onChange={e => handleChange(e.target.value)}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
              />
            </div>
            {erro && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-error">
                <span className="material-symbols-outlined text-[15px]">error</span>
                {erro}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !contato.trim()}
            className="flex w-full h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                Continuar
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-[12px] text-on-surface-variant/60">
        <span className="material-symbols-outlined text-[13px] align-middle mr-1">lock</span>
        Seus dados são protegidos. Não enviamos spam.
      </p>
    </div>
  )
}
