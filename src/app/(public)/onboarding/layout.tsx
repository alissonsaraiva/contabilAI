'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChatWidget } from '@/components/onboarding/chat-widget'

const STEPS = [
  { path: '/onboarding', label: 'Identificação' },
  { path: '/onboarding/simulador', label: 'Simulador' },
  { path: '/onboarding/plano', label: 'Plano' },
  { path: '/onboarding/dados', label: 'Seus dados' },
  { path: '/onboarding/revisao', label: 'Revisão' },
  { path: '/onboarding/contrato', label: 'Contrato' },
  { path: '/onboarding/confirmacao', label: 'Confirmação' },
]

function getStep(pathname: string) {
  const idx = STEPS.findIndex(s => s.path === pathname)
  return idx === -1 ? 1 : idx + 1
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const step = getStep(pathname)
  const total = STEPS.length
  const pct = Math.round((step / total) * 100)
  const isConfirmacao = pathname === '/onboarding/confirmacao'

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-outline-variant/15">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                calculate
              </span>
            </div>
            <span className="text-[15px] font-semibold text-on-surface">ContabAI</span>
          </Link>

          {!isConfirmacao && (
            <span className="text-[13px] font-medium text-on-surface-variant">
              Passo <span className="font-semibold text-primary">{step}</span> de {total}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {!isConfirmacao && (
          <div className="h-0.5 bg-outline-variant/20">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-lg px-4 py-8 pb-16">
        {children}
      </main>

      <ChatWidget />
    </div>
  )
}
