'use client'

// ─── Spedy não configurado no escritório ──────────────────────────────────────

export function SpedyNaoConfigurado() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/30 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
        <span className="material-symbols-outlined text-[24px] text-on-surface-variant">receipt_long</span>
      </div>
      <div>
        <p className="text-[14px] font-semibold text-on-surface">Spedy não configurado</p>
        <p className="mt-1 text-[12px] text-on-surface-variant/70">Configure a integração Spedy em Configurações → Integrações para habilitar emissão de NFS-e.</p>
      </div>
      <a
        href="/crm/configuracoes/integracoes"
        className="rounded-xl bg-primary/10 px-4 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        Ir para Integrações
      </a>
    </div>
  )
}

// ─── Empresa não cadastrada na Spedy ─────────────────────────────────────────

type EmpresaNaoCadastradaProps = {
  sincronizando: boolean
  onSincronizar: () => void
}

export function EmpresaNaoCadastrada({ sincronizando, onSincronizar }: EmpresaNaoCadastradaProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant/30 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
        <span className="material-symbols-outlined text-[24px] text-on-surface-variant">business</span>
      </div>
      <div>
        <p className="text-[14px] font-semibold text-on-surface">Empresa não cadastrada na Spedy</p>
        <p className="mt-1 text-[12px] text-on-surface-variant/70">
          O cadastro é feito automaticamente ao salvar o CNPJ da empresa. Se o cadastro automático falhou, clique abaixo para tentar novamente.
        </p>
      </div>
      <button
        onClick={onSincronizar}
        disabled={sincronizando}
        className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        {sincronizando ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : (
          <span className="material-symbols-outlined text-[16px]">sync</span>
        )}
        {sincronizando ? 'Cadastrando...' : 'Cadastrar na Spedy'}
      </button>
    </div>
  )
}
