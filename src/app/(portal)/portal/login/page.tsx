import { getEscritorioConfig } from '@/lib/escritorio'
import { prisma } from '@/lib/prisma'
import { AvosWordmark } from '@/components/avos-logo'
import { PortalLoginForm } from './_login-form'

export default async function PortalLoginPage() {
  const escritorio = await getEscritorioConfig()
  const nome = escritorio.nome

  let whatsappHabilitado = false
  try {
    const row = await prisma.escritorio.findFirst({
      select: { evolutionApiUrl: true, evolutionApiKey: true, evolutionInstance: true },
    })
    whatsappHabilitado = !!(row?.evolutionApiUrl && row.evolutionApiKey && row.evolutionInstance)
  } catch { /* sem DB no build — default false */ }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4">
      <div className="mb-8">
        <AvosWordmark size={48} nome={nome} tagline="Gestão Inteligente" />
      </div>
      <PortalLoginForm nome={nome} whatsappHabilitado={whatsappHabilitado} />
    </div>
  )
}
