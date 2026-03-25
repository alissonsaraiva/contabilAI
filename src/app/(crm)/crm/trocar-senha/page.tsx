'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'

const INPUT = 'w-full h-11 rounded-[10px] border border-outline-variant/30 bg-surface-container-low px-4 text-[14px] text-on-surface shadow-sm transition-colors focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-[3px] focus:ring-primary/10 placeholder:text-on-surface-variant/40'
const LABEL = 'block text-[13px] font-semibold text-on-surface-variant mb-1.5'

export default function TrocarSenhaPage() {
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showNova, setShowNova] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (novaSenha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres'); return }
    if (novaSenha !== confirmar) { setErro('As senhas não coincidem'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/trocar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novaSenha }),
      })
      if (!res.ok) throw new Error()
      toast.success('Senha definida! Faça login novamente.')
      await signOut({ callbackUrl: '/login' })
    } catch {
      toast.error('Erro ao salvar senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-[16px] border border-outline-variant/15 bg-card shadow-sm">
          {/* Header */}
          <div className="border-b border-outline-variant/15 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <span className="material-symbols-outlined text-[20px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>lock_reset</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-on-surface">Defina sua senha</h1>
                <p className="text-[12px] text-on-surface-variant">Crie uma senha de acesso ao CRM</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-[12px] leading-relaxed text-primary/80">
                Este é seu primeiro acesso. Escolha uma senha segura para continuar.
              </p>
            </div>

            <div>
              <label className={LABEL}>Nova senha <span className="text-error">*</span></label>
              <div className="relative">
                <input
                  type={showNova ? 'text' : 'password'}
                  className={INPUT + ' pr-11'}
                  placeholder="Mínimo 6 caracteres"
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNova(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">{showNova ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className={LABEL}>Confirmar senha <span className="text-error">*</span></label>
              <div className="relative">
                <input
                  type={showConfirmar ? 'text' : 'password'}
                  className={INPUT + ' pr-11'}
                  placeholder="Repita a senha"
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmar(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">{showConfirmar ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {erro && (
              <p className="text-[12px] font-medium text-error">{erro}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <span className="material-symbols-outlined text-[16px]">check</span>
              }
              Salvar senha e entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
