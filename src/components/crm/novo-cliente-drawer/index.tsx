'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useNovoCliente } from './use-novo-cliente'
import { SectionDadosPessoais } from './section-dados-pessoais'
import { SectionDadosPJ } from './section-dados-pj'
import { SectionDadosPF } from './section-dados-pf'
import { SectionEndereco } from './section-endereco'
import { SectionPlano } from './section-plano'

export function NovoClienteDrawer() {
  const {
    open, setOpen, loading, form, erros, set, reset, handleSubmit,
    cnpjLoading, cepLoading, preencherCEP, preencherCNPJ,
  } = useNovoCliente()

  return (
    <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-bold tracking-wide text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow"
      >
        <span className="material-symbols-outlined text-[18px] transition-transform group-hover:scale-110">person_add</span>
        Novo Cliente
      </button>

      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0 bg-card" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-outline-variant/15 px-6 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Novo Cliente</h2>
            <p className="text-[12px] text-on-surface-variant">Cadastre um novo cliente na base</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 custom-scrollbar">
            {/* Toggle PJ / PF */}
            <div className="flex gap-2">
              {(['pj', 'pf'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('tipoContribuinte', t)}
                  className={`flex-1 rounded-xl border py-2.5 text-[13px] font-semibold transition-all ${form.tipoContribuinte === t
                      ? 'border-primary/40 bg-primary/8 text-primary ring-2 ring-primary/20'
                      : 'border-outline-variant/20 bg-surface-container-low text-on-surface-variant hover:border-outline-variant/40'
                    }`}
                >
                  {t === 'pj' ? '🏢 Empresa / PJ' : '👤 Autônomo / PF'}
                </button>
              ))}
            </div>

            <SectionDadosPessoais form={form} set={set} erros={erros} />

            <SectionDadosPJ form={form} set={set} cnpjLoading={cnpjLoading} preencherCNPJ={preencherCNPJ} />
            <SectionDadosPF form={form} set={set} />

            <SectionEndereco form={form} set={set} cepLoading={cepLoading} preencherCEP={preencherCEP} />
            <SectionPlano form={form} set={set} erros={erros} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-outline-variant/15 px-6 py-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <span className="material-symbols-outlined text-[16px]">add</span>
              }
              Cadastrar Cliente
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
