import Link from 'next/link'
import { buttonVariants } from '@/lib/button-variants'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl font-medium">Página não encontrada</p>
      <p className="text-muted-foreground">A página que você procura não existe ou foi movida.</p>
      <Link href="/" className={cn(buttonVariants())}>Voltar ao início</Link>
    </div>
  )
}
