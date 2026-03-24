import Link from 'next/link'

const STEPS = [
  'Identificação',
  'Simulador',
  'Plano',
  'Seus dados',
  'Sócios',
  'Revisão',
  'Assinatura',
  'Confirmação',
]

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold text-primary">
            ContabAI
          </Link>
          <span className="text-sm text-muted-foreground">Contratação digital</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {children}
      </main>
    </div>
  )
}
