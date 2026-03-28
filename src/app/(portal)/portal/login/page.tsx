import { getEscritorioConfig } from '@/lib/escritorio'
import { PortalLoginForm } from './_login-form'

export default async function PortalLoginPage() {
  const escritorio = await getEscritorioConfig()
  const nome = escritorio.nome

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>calculate</span>
        </div>
        <span className="font-headline text-2xl font-bold tracking-tight text-on-surface">{nome}</span>
      </div>
      <PortalLoginForm nome={nome} />
    </div>
  )
}
