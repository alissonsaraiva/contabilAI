import { redirect } from 'next/navigation'

type Props = { searchParams: Promise<{ token?: string }> }

/**
 * Redireciona para o Route Handler que faz a validação e seta o cookie.
 * Cookies só podem ser setados em Route Handlers ou Server Actions (Next.js 15+),
 * não em RSC pages — por isso a lógica real vive em /api/portal/verificar.
 */
export default async function PortalVerificarPage({ searchParams }: Props) {
  const { token } = await searchParams
  if (!token) redirect('/portal/login?erro=token_invalido')
  redirect(`/api/portal/verificar?token=${encodeURIComponent(token!)}`)
}
