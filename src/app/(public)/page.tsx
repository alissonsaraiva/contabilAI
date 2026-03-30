import Link from 'next/link'
import { CheckCircle2, Bot, FileText, ShieldCheck, ArrowRight, Zap } from 'lucide-react'
import { formatBRL, cn } from '@/lib/utils'
import { mockPlanos } from '@/lib/mock/planos'
import { prisma } from '@/lib/prisma'
import { getEscritorioConfig } from '@/lib/escritorio'

const FEATURES = [
  { icon: Bot,         title: 'IA que trabalha por você',  desc: 'Relatórios, análises e dúvidas respondidas automaticamente 24h por dia.' },
  { icon: FileText,    title: 'Contrato 100% digital',      desc: 'Assine pelo celular em 2 minutos. Sem papelada, sem deslocamento.' },
  { icon: ShieldCheck, title: 'Obrigações em dia',          desc: 'DAS, DCTF, SPED e mais — entregues automaticamente no prazo.' },
  { icon: Zap,         title: 'Portal do cliente',          desc: 'Acesse documentos, boletos e relatórios de qualquer lugar.' },
]

const STATS = [
  { value: '500+',  label: 'Escritórios ativos' },
  { value: '98%',   label: 'Satisfação' },
  { value: '60%',   label: 'Menos retrabalho' },
  { value: '24/7',  label: 'IA disponível' },
]

export default async function LandingPage() {
  const [dbPlanos, escritorio] = await Promise.all([
    prisma.plano.findMany({ where: { ativo: true }, orderBy: { valorMinimo: 'asc' } }).catch(() => [] as Awaited<ReturnType<typeof prisma.plano.findMany>>),
    getEscritorioConfig(),
  ])
  const nomeEscritorio = escritorio.nome
  const anoAtual = new Date().getFullYear()
  const planos: typeof mockPlanos = dbPlanos.length > 0
    ? dbPlanos.map(p => ({
        tipo: p.tipo as (typeof mockPlanos)[0]['tipo'],
        nome: p.nome,
        descricao: p.descricao ?? '',
        valorMinimo: Number(p.valorMinimo),
        valorMaximo: Number(p.valorMaximo),
        servicos: p.servicos as string[],
        destaque: p.destaque,
      }))
    : mockPlanos

  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans">

      {/* ── Announce Bar ── */}
      <div className="bg-[#FF5C35] text-white flex items-center justify-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold">
        <span className="hidden sm:inline bg-white/20 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">Novo</span>
        IA com RAG ativo — respostas 3× mais precisas sobre obrigações fiscais
        <span className="hidden sm:inline text-white/70 font-normal">· Saiba mais →</span>
      </div>

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-outline-variant/20 bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                calculate
              </span>
            </div>
            <span className="text-lg font-bold tracking-tight text-on-surface">{nomeEscritorio}</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-[14px] font-medium text-on-surface-variant hover:text-primary transition-colors">Funcionalidades</Link>
            <Link href="#planos" className="text-[14px] font-medium text-on-surface-variant hover:text-primary transition-colors">Planos</Link>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/portal/dashboard" className="text-[14px] font-semibold text-on-surface-variant hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-surface-container">
              Entrar
            </Link>
            <Link href="/onboarding" className="rounded-lg bg-primary px-4 py-2 text-[14px] font-semibold text-white shadow-sm hover:bg-primary/90 transition-all">
              Começar agora
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[#0A1128] px-4 pt-24 pb-20 md:pt-32 md:pb-28 text-center">
        {/* Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-primary/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-[#FF5C35]/10 blur-[80px] pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-4xl">
          {/* Eyebrow */}
          <span className="inline-flex mb-8 items-center gap-2 rounded-full border border-white/15 bg-white/08 px-4 py-1.5 text-[12px] font-bold uppercase tracking-widest text-white/75">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF5C35] animate-pulse" />
            Plataforma para escritórios contábeis · 2026
          </span>

          {/* Headline */}
          <h1 className="mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl md:text-[68px] font-headline text-white leading-[1.06] md:letter-spacing-[-2.5px]">
            O futuro da contabilidade<br className="hidden md:block" />
            é{' '}
            <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
              automatizado
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-[17px] md:text-[19px] text-white/60 leading-relaxed">
            IA especializada, CRM completo e portal do cliente —<br className="hidden md:block" />
            tudo integrado e pronto para escalar seu escritório.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Link
              href="/onboarding"
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#FF5C35] px-7 py-3.5 text-[15px] font-bold text-white shadow-sm hover:bg-[#E84D28] transition-all hover:-translate-y-0.5"
            >
              Começar grátis — sem cartão <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#planos"
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/06 px-7 py-3.5 text-[15px] font-semibold text-white/85 transition-all hover:bg-white/10"
            >
              Ver planos
            </Link>
          </div>
          <p className="text-[12px] text-white/35">Sem cartão de crédito · Setup em 10 minutos · Cancele quando quiser</p>

          {/* Stats strip */}
          <div className="mt-12 pt-8 border-t border-white/08 flex items-center justify-center gap-0 flex-wrap">
            {STATS.map((stat, i) => (
              <div key={stat.value} className="flex items-center">
                <div className="px-8 text-center">
                  <div className="text-[28px] font-extrabold text-white leading-none tracking-tight">{stat.value}</div>
                  <div className="text-[12px] text-white/45 mt-1">{stat.label}</div>
                </div>
                {i < STATS.length - 1 && (
                  <div className="h-8 w-px bg-white/10" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <span className="text-[12px] font-bold uppercase tracking-widest text-primary block mb-3">Funcionalidades</span>
          <h2 className="font-headline text-3xl md:text-[40px] font-extrabold tracking-tight text-on-surface mb-4" style={{ letterSpacing: '-1.2px' }}>
            Tudo que seu escritório precisa
          </h2>
          <p className="text-[17px] text-on-surface-variant/80 max-w-xl mx-auto">
            Da captação do lead à entrega do serviço — a plataforma cuida do meio do caminho.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group rounded-xl border border-outline-variant/20 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:border-primary/20 flex flex-col items-start text-left">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/08 transition-colors group-hover:bg-primary">
                <Icon className="h-5 w-5 text-primary transition-colors group-hover:text-white" />
              </div>
              <h3 className="mb-2 font-headline text-[15px] font-bold text-on-surface">{title}</h3>
              <p className="text-[13px] leading-relaxed text-on-surface-variant/80">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Planos ── */}
      <section id="planos" className="bg-surface-container-low py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <span className="text-[12px] font-bold uppercase tracking-widest text-[#FF5C35] block mb-3">Planos</span>
            <h2 className="font-headline text-3xl md:text-[40px] font-extrabold tracking-tight text-on-surface mb-3" style={{ letterSpacing: '-1.2px' }}>
              Preço simples e transparente
            </h2>
            <p className="text-[17px] text-on-surface-variant/80">Sem letras miúdas. Cancele quando quiser.</p>
          </div>

          <div className="grid gap-5 md:gap-6 md:grid-cols-2 lg:grid-cols-4 items-center">
            {planos.map((plano) => (
              <div
                key={plano.tipo}
                className={cn(
                  'relative flex flex-col overflow-hidden rounded-xl border p-6 md:p-7 transition-all',
                  plano.destaque
                    ? 'border-primary/30 bg-white ring-2 ring-primary/20 shadow-lg scale-100 lg:scale-[1.03] z-10'
                    : 'border-outline-variant/20 bg-white shadow-sm hover:shadow-md'
                )}
              >
                {plano.destaque && (
                  <div className="absolute top-0 right-0 left-0 bg-primary py-1.5 text-center text-[10px] font-bold uppercase tracking-widest text-white">
                    Mais popular
                  </div>
                )}

                <div className={cn('mb-6', plano.destaque ? 'mt-5' : '')}>
                  <h3 className="font-headline text-[18px] font-bold text-on-surface">{plano.nome}</h3>
                  <p className="mt-1.5 text-[13px] text-on-surface-variant/80 min-h-[40px]">{plano.descricao}</p>
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-[15px] font-semibold text-on-surface-variant">R$</span>
                    <span className="font-headline text-[42px] font-extrabold tracking-tight text-primary leading-none" style={{ letterSpacing: '-2px' }}>
                      {plano.valorMinimo}
                    </span>
                    <span className="text-[13px] text-on-surface-variant/60">/mês</span>
                  </div>
                </div>

                <div className="mb-7 flex-1">
                  <ul className="space-y-3">
                    {plano.servicos.map((s) => (
                      <li key={s} className="flex items-start gap-2.5 text-[13px] text-on-surface-variant/90">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-status" />
                        <span className="leading-snug">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href={`/onboarding?plano=${plano.tipo}`}
                  className={cn(
                    'mt-auto flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-[14px] font-semibold transition-all',
                    plano.destaque
                      ? 'bg-primary text-white shadow-sm hover:bg-primary/90'
                      : 'border border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-container-high'
                  )}
                >
                  Contratar {plano.nome}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="mx-auto max-w-5xl px-4 py-16 md:py-24">
        <div className="relative overflow-hidden rounded-2xl bg-[#0A1128] px-8 py-14 text-center md:px-16 md:py-20 shadow-2xl">
          <div className="absolute -top-24 -left-24 h-56 w-56 rounded-full bg-primary/25 blur-[70px]" />
          <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-[#FF5C35]/15 blur-[70px]" />

          <h2 className="relative z-10 mb-4 font-headline text-3xl font-extrabold tracking-tight text-white md:text-[42px]" style={{ letterSpacing: '-1.2px' }}>
            Modernize seu escritório hoje.<br className="hidden md:block" /> Sem burocracia.
          </h2>
          <p className="relative z-10 mx-auto mb-10 max-w-xl text-[16px] text-white/60">
            Configure em 10 minutos. Sem cartão de crédito. Suporte incluído.
          </p>
          <div className="relative z-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/onboarding" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF5C35] px-7 py-3.5 text-[15px] font-bold text-white hover:bg-[#E84D28] transition-all hover:-translate-y-0.5">
              Começar grátis <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="#planos" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/06 px-7 py-3.5 text-[15px] font-semibold text-white/85 hover:bg-white/10 transition-all">
              Ver planos
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-outline-variant/15 bg-surface-container-lowest py-10 text-center text-[13px]">
        <div className="mb-4 flex items-center justify-center gap-2 opacity-50">
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            calculate
          </span>
          <span className="font-headline font-bold">{nomeEscritorio}</span>
        </div>
        <p className="text-on-surface-variant/70">© {anoAtual} {nomeEscritorio}. Todos os direitos reservados.</p>
        <p className="mt-1 text-on-surface-variant/45">Eusébio e Fortaleza, CE</p>
      </footer>
    </div>
  )
}
