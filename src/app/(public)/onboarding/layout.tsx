'use client'

import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { toast } from 'sonner'
import { ChatWidget } from '@/components/onboarding/chat-widget'

// Step 7 (confirmação) é terminal — não entra no wizard
const WIZARD_STEPS = [
  { path: '/onboarding', label: 'Início' },
  { path: '/onboarding/simulador', label: 'Perfil' },
  { path: '/onboarding/plano', label: 'Plano' },
  { path: '/onboarding/dados', label: 'Dados' },
  { path: '/onboarding/revisao', label: 'Pagamento' },
  { path: '/onboarding/contrato', label: 'Contrato' },
]

function getIdx(pathname: string) {
  return WIZARD_STEPS.findIndex(s => s.path === pathname)
}

function buildUrl(path: string, leadId: string | null, plano: string | null) {
  const p = new URLSearchParams()
  if (leadId) p.set('leadId', leadId)
  if (plano) p.set('plano', plano)
  const q = p.toString()
  return q ? `${path}?${q}` : path
}

function HeaderInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const leadId = searchParams.get('leadId')
  const plano = searchParams.get('plano')
  const currentIdx = getIdx(pathname)
  const isConfirmacao = pathname === '/onboarding/confirmacao'
  const isWizard = currentIdx !== -1 && !isConfirmacao

  function handleSalvarSair() {
    toast.success('Progresso salvo! Volte a qualquer momento com o mesmo e-mail ou WhatsApp.')
    router.push('/')
  }

  return (
    <>
      {/* Barra principal */}
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
        {/* Back ou Logo */}
        {isWizard && currentIdx > 0 ? (
          <button
            onClick={() => router.push(buildUrl(WIZARD_STEPS[currentIdx - 1].path, leadId, plano))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
            aria-label="Voltar"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
        ) : (
          <div className="w-8 shrink-0" />
        )}

        {/* Logo centralizado */}
        <Link href="/" className="flex flex-1 items-center justify-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
            <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              calculate
            </span>
          </div>
          <span className="text-[15px] font-semibold text-on-surface">ContabAI</span>
        </Link>

        {/* Salvar e sair */}
        {isWizard && leadId ? (
          <button
            onClick={handleSalvarSair}
            className="w-8 shrink-0 text-[11px] font-medium text-on-surface-variant/50 hover:text-on-surface-variant transition-colors text-right leading-tight"
            title="Salvar progresso e sair"
          >
            <span className="material-symbols-outlined text-[18px] block mx-auto">bookmark</span>
          </button>
        ) : (
          <div className="w-8 shrink-0" />
        )}
      </div>

      {/* Step wizard */}
      {isWizard && (
        <div className="mx-auto max-w-lg px-4 pb-3">
          <div className="flex items-center">
            {WIZARD_STEPS.map((step, idx) => {
              const isDone = idx < currentIdx
              const isCurrent = idx === currentIdx
              const isClickable = isDone && leadId

              return (
                <div key={step.path} className="flex flex-1 items-center">
                  {/* Bolinha */}
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && router.push(buildUrl(step.path, leadId, plano))}
                    className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all
                      ${isCurrent ? 'bg-primary text-white shadow-md shadow-primary/30 scale-110' : ''}
                      ${isDone ? 'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30' : ''}
                      ${!isDone && !isCurrent ? 'bg-surface-container text-on-surface-variant/40' : ''}
                    `}
                    title={isClickable ? `Voltar para ${step.label}` : step.label}
                  >
                    {isDone ? (
                      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        check
                      </span>
                    ) : (
                      idx + 1
                    )}
                  </button>

                  {/* Linha conectora */}
                  {idx < WIZARD_STEPS.length - 1 && (
                    <div className="mx-1 h-0.5 flex-1 rounded-full">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${idx < currentIdx ? 'bg-primary/40' : 'bg-outline-variant/20'}`}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Label da etapa atual */}
          <p className="mt-1.5 text-center text-[11px] font-medium text-on-surface-variant/60">
            {WIZARD_STEPS[currentIdx]?.label}
          </p>
        </div>
      )}
    </>
  )
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-outline-variant/15">
        <Suspense fallback={<div className="h-14" />}>
          <HeaderInner />
        </Suspense>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6 pb-16">
        {children}
      </main>

      <ChatWidget />
    </div>
  )
}
