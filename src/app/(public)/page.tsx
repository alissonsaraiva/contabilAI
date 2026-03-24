import Link from 'next/link'
import { buttonVariants } from '@/lib/button-variants'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Bot, FileText, ShieldCheck, ArrowRight, Zap } from 'lucide-react'
import { formatBRL, cn } from '@/lib/utils'
import { mockPlanos } from '@/lib/mock/planos'

const FEATURES = [
  { icon: Bot, title: 'IA que trabalha por você', desc: 'Relatórios, análises e dúvidas respondidas automaticamente 24h por dia.' },
  { icon: FileText, title: 'Contrato 100% digital', desc: 'Assine pelo celular em 2 minutos. Sem papelada, sem deslocamento.' },
  { icon: ShieldCheck, title: 'Obrigações em dia', desc: 'DAS, DCTF, SPED e mais — entregues automaticamente no prazo.' },
  { icon: Zap, title: 'Portal do cliente', desc: 'Acesse documentos, boletos e relatórios de qualquer lugar.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <span className="text-xl font-bold text-primary">ContabAI</span>
          <div className="flex items-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: 'ghost' }))}>
              Entrar
            </Link>
            <Link href="/onboarding" className={cn(buttonVariants())}>
              Começar agora
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <Badge variant="secondary" className="mb-4">
          Contabilidade 100% digital com IA
        </Badge>
        <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl">
          Sua empresa em dia,{' '}
          <span className="text-primary">sem sair de casa</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
          MEI, EPP e autônomos em Eusébio e Fortaleza. Contabilidade automatizada
          com IA — obrigações, relatórios e dúvidas resolvidas no portal.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/onboarding" className={cn(buttonVariants({ size: 'lg' }))}>
            Fazer simulação grátis <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link href="#planos" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
            Ver planos
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border-0 bg-muted/40">
              <CardHeader className="pb-2">
                <Icon className="mb-2 h-8 w-8 text-primary" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-3xl font-bold">Planos transparentes</h2>
          <p className="text-muted-foreground">Sem letras miúdas. Cancele quando quiser.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {mockPlanos.map((plano) => (
            <Card
              key={plano.tipo}
              className={plano.destaque ? 'border-primary shadow-lg ring-1 ring-primary' : ''}
            >
              <CardHeader>
                {plano.destaque && (
                  <Badge className="mb-2 w-fit">Mais popular</Badge>
                )}
                <CardTitle>{plano.nome}</CardTitle>
                <p className="text-sm text-muted-foreground">{plano.descricao}</p>
                <p className="text-2xl font-bold text-primary">
                  a partir de {formatBRL(plano.valorMinimo)}
                  <span className="text-sm font-normal text-muted-foreground">/mês</span>
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plano.servicos.map((s) => (
                    <li key={s} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {s}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/onboarding?plano=${plano.tipo}`}
                  className={cn(
                    buttonVariants({ variant: plano.destaque ? 'default' : 'outline' }),
                    'mt-6 w-full justify-center',
                  )}
                >
                  Contratar
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-primary py-16 text-primary-foreground">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold">Pronto para começar?</h2>
          <p className="mb-8 text-primary-foreground/80">
            Faça a simulação em 2 minutos e receba uma recomendação personalizada.
          </p>
          <Link href="/onboarding" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>
            Simular agora — é grátis <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© 2026 ContabAI. Todos os direitos reservados.</p>
        <p className="mt-1">Eusébio e Fortaleza, CE</p>
      </footer>
    </div>
  )
}
