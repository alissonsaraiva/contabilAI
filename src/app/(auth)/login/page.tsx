import { getEscritorioConfig } from '@/lib/escritorio'
import { AvosWordmark } from '@/components/avos-logo'
import { LoginForm } from './_login-form'

export default async function LoginPage() {
  const escritorio = await getEscritorioConfig()
  const nome = escritorio.nome

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4">
      {/* Brand */}
      <div className="mb-8">
        <AvosWordmark size={48} nome={nome} tagline="Gestão Inteligente" />
      </div>

      <LoginForm nome={nome} />
    </div>
  )
}
