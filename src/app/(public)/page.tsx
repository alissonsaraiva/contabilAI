import Link from 'next/link'
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
    <div className="min-h-screen bg-surface text-on-surface font-sans relative overflow-hidden">
      {/* Background glow for hero */}
      <div className="absolute top-0 left-1/2 -z-10 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-outline-variant/20 bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_15px_rgba(99,102,241,0.4)]">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                calculate
              </span>
            </div>
            <span className="text-lg font-bold tracking-tight text-on-surface">ContabAI</span>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <Link href="/portal/dashboard" className="text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">
              Entrar
            </Link>
            <Link href="/onboarding" className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-all">
              Começar agora
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pt-20 pb-16 md:pt-28 md:pb-24 text-center relative z-10">
        <span className="inline-flex mb-6 items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Contabilidade 100% digital com IA
        </span>
        <h1 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl md:text-7xl font-headline text-on-surface leading-tight">
          Sua empresa em dia,{' '}
          <br className="hidden md:block" />
          <span className="bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
            sem sair de casa
          </span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-base md:text-xl text-on-surface-variant/90 leading-relaxed font-medium">
          Para MEI, EPP e autônomos. Deixe as obrigações, relatórios e burocracias no
          piloto automático com nossa IA financeira diretamente no seu portal.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/onboarding" className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all hover:bg-primary/90 hover:scale-[1.02]">
            Fazer simulação grátis <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="#planos" className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-lowest px-8 py-4 text-sm font-bold text-on-surface transition-all hover:bg-surface-container-low hover:border-outline-variant/50">
            Ver planos
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group rounded-[20px] border border-outline-variant/15 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/20 flex flex-col items-start text-left">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary">
                <Icon className="h-6 w-6 text-primary transition-colors group-hover:text-white" />
              </div>
              <h3 className="mb-2 font-headline text-lg font-semibold text-on-surface">{title}</h3>
              <p className="text-sm leading-relaxed text-on-surface-variant/90">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="mx-auto max-w-7xl px-4 py-16 md:py-24">
        <div className="mb-12 md:mb-16 text-center">
          <h2 className="mb-3 font-headline text-3xl font-bold tracking-tight md:text-5xl text-on-surface">Planos transparentes</h2>
          <p className="text-base md:text-lg font-medium text-on-surface-variant/80">Sem letras miúdas. Sem surpresas na fatura. Cancele quando quiser.</p>
        </div>

        <div className="grid gap-6 md:gap-8 md:grid-cols-2 lg:grid-cols-4 items-center">
          {mockPlanos.map((plano) => (
            <div
              key={plano.tipo}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-[24px] border p-6 md:p-8 transition-all',
                plano.destaque
                  ? 'border-primary/30 bg-white ring-2 ring-primary/20 shadow-[0_8px_30px_rgba(99,102,241,0.12)] scale-100 lg:scale-[1.03] z-10'
                  : 'border-outline-variant/20 bg-surface-container-lowest shadow-sm hover:shadow-md'
              )}
            >
              {plano.destaque && (
                <div className="absolute top-0 right-0 left-0 bg-primary py-1.5 text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-primary-foreground">
                  Mais popular
                </div>
              )}

              <div className={cn("mb-6", plano.destaque ? "mt-4" : "")}>
                <h3 className="font-headline text-xl font-bold text-on-surface">{plano.nome}</h3>
                <p className="mt-2 text-sm text-on-surface-variant/80 min-h-[40px]">{plano.descricao}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-sm font-semibold text-on-surface-variant">R$</span>
                  <span className="font-headline text-4xl font-extrabold tracking-tight text-primary">
                    {plano.valorMinimo}
                  </span>
                  <span className="text-sm font-medium text-on-surface-variant/70">/mês</span>
                </div>
              </div>

              <div className="mb-8 flex-1">
                <ul className="space-y-3.5">
                  {plano.servicos.map((s) => (
                    <li key={s} className="flex items-start gap-3 text-sm font-medium text-on-surface-variant/90">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-status" />
                      <span className="leading-snug">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href={`/onboarding?plano=${plano.tipo}`}
                className={cn(
                  'mt-auto flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all',
                  plano.destaque
                    ? 'bg-primary text-white shadow-md hover:bg-primary/90 hover:scale-[1.02]'
                    : 'bg-surface-container text-on-surface hover:bg-outline-variant/30 hover:scale-[1.02]'
                )}
              >
                Contratar {plano.nome}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-5xl px-4 py-12 md:py-24">
        <div className="relative overflow-hidden rounded-[32px] bg-[#0A0A0B] px-6 py-12 text-center md:px-12 md:py-20 shadow-2xl">
          {/* Decorative Glows */}
          <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-primary/30 blur-[80px]" />
          <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-tertiary/20 blur-[80px]" />

          <h2 className="relative z-10 mb-4 font-headline text-3xl font-bold tracking-tight text-white md:text-5xl">
            Pronto para focar no seu negócio?
          </h2>
          <p className="relative z-10 mx-auto mb-10 max-w-2xl text-base md:text-lg font-medium text-white/70">
            Chega de burocracia. Faça uma simulação rápida, escolha o plano ideal
            e receba seu contrato automaticamente via WhatsApp.
          </p>
          <Link href="/onboarding" className="relative z-10 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-[#0A0A0B] transition-all hover:bg-surface-container-low hover:scale-[1.02]">
            Simular agora — é grátis <ArrowRight className="h-4 w-4 text-primary" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-outline-variant/15 bg-surface-container-lowest py-10 text-center text-sm">
        <div className="mb-4 flex items-center justify-center gap-2 opacity-50 grayscale">
          <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            calculate
          </span>
          <span className="font-headline font-bold">ContabAI</span>
        </div>
        <p className="font-medium text-on-surface-variant/80">© 2026 ContabAI. Todos os direitos reservados.</p>
        <p className="mt-1 text-on-surface-variant/60">Eusébio e Fortaleza, CE</p>
      </footer>
    </div>
  )
}
