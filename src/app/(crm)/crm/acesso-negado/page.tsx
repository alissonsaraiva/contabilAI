import Link from 'next/link'

export default function AcessoNegadoPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-24">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="material-symbols-outlined text-[64px] text-on-surface-variant/20">
          lock
        </span>
        <div>
          <h1 className="font-headline text-[22px] font-semibold tracking-tight text-on-surface">
            Acesso não autorizado
          </h1>
          <p className="mt-1.5 text-[13px] font-medium text-on-surface-variant/70">
            Você não tem permissão para acessar esta página.
            <br />
            Fale com o administrador do sistema se precisar de acesso.
          </p>
        </div>
      </div>
      <Link
        href="/crm/dashboard"
        className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90 active:scale-95"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Voltar ao Dashboard
      </Link>
    </div>
  )
}
