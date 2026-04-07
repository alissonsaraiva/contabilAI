'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { MENUS_DISPONIVEIS, DEFAULT_PERMISSOES, resolverPermissoes, type MenuPermissoes } from '@/lib/menu-permissoes'

type Props = {
  initialPermissoes: unknown
}

// Grupos únicos preservando ordem
const GRUPOS = Array.from(new Set(MENUS_DISPONIVEIS.map(m => m.grupo)))

export function MenuPermissoesConfig({ initialPermissoes }: Props) {
  // Baseline fixo — derivado apenas na montagem; atualizado após cada save bem-sucedido
  const initial = useMemo(() => resolverPermissoes(initialPermissoes), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [baseline, setBaseline] = useState<MenuPermissoes>(initial)

  const [contador, setContador] = useState<string[]>(initial.contador)
  const [assistente, setAssistente] = useState<string[]>(initial.assistente)
  const [saving, setSaving] = useState(false)

  // Detectar mudanças em relação ao último save (ou ao carregamento inicial)
  const isDirty = useMemo(() => {
    const same = (a: string[], b: string[]) =>
      a.length === b.length && a.every(x => b.includes(x))
    return !same(contador, baseline.contador) || !same(assistente, baseline.assistente)
  }, [contador, assistente, baseline])

  function toggle(role: 'contador' | 'assistente', href: string) {
    const setter = role === 'contador' ? setContador : setAssistente
    const current = role === 'contador' ? contador : assistente
    setter(current.includes(href)
      ? current.filter(h => h !== href)
      : [...current, href]
    )
  }

  async function salvar() {
    setSaving(true)
    try {
      const res = await fetch('/api/configuracoes/menu-permissoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contador, assistente }),
      })
      if (!res.ok) throw new Error()
      // Atualizar baseline para refletir o estado salvo — isDirty volta a false
      setBaseline({ contador: [...contador], assistente: [...assistente] })
      toast.success('Permissões salvas com sucesso.')
    } catch {
      toast.error('Erro ao salvar permissões. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-outline-variant/20 bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-outline-variant/10 px-6 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/50">
            Permissões de Menu
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-on-surface-variant/70">
            Defina quais menus cada perfil pode acessar. Alterações refletem em até 5 minutos.
          </p>
        </div>
        <button
          onClick={salvar}
          disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[12px] font-semibold text-white shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
        >
          {saving ? (
            <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-[16px]">save</span>
          )}
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant/10 bg-surface-container-lowest/40">
              <th className="w-[40%] px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                Menu
              </th>
              <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-error/80">
                Admin
              </th>
              <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-primary/80">
                Contador
              </th>
              <th className="px-6 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                Assistente
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {GRUPOS.map(grupo => {
              const itens = MENUS_DISPONIVEIS.filter(m => m.grupo === grupo)
              return itens.map((item, idx) => {
                const isContador = contador.includes(item.href)
                const isAssistente = assistente.includes(item.href)

                return (
                  <tr key={item.href} className="group transition-colors hover:bg-surface-container-lowest/60">
                    {/* Label com grupo no primeiro item */}
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        {idx === 0 && (
                          <span className="mr-1 rounded-[4px] border border-outline-variant/10 bg-surface-container-lowest px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">
                            {grupo}
                          </span>
                        )}
                        {idx !== 0 && <span className="w-[calc(theme(spacing.1)*6+4ch)]" />}
                        <span className="text-[14px] leading-none">{item.icon}</span>
                        <span className="text-[13px] font-medium text-on-surface">{item.label}</span>
                      </div>
                    </td>

                    {/* Admin — sempre marcado, não editável */}
                    <td className="px-6 py-3 text-center">
                      <CheckboxCell checked disabled />
                    </td>

                    {/* Contador */}
                    <td className="px-6 py-3 text-center">
                      <CheckboxCell
                        checked={isContador}
                        onChange={() => toggle('contador', item.href)}
                      />
                    </td>

                    {/* Assistente */}
                    <td className="px-6 py-3 text-center">
                      <CheckboxCell
                        checked={isAssistente}
                        onChange={() => toggle('assistente', item.href)}
                      />
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      <div className="border-t border-outline-variant/10 px-6 py-3">
        <p className="text-[11px] text-on-surface-variant/40">
          <span className="material-symbols-outlined mr-1 align-middle text-[13px]">info</span>
          As permissões propagam automaticamente para todos os usuários do perfil em até 5 minutos.
        </p>
      </div>
    </div>
  )
}

function CheckboxCell({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange?: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={[
        'mx-auto flex h-5 w-5 items-center justify-center rounded-[5px] border transition-all',
        disabled
          ? 'cursor-not-allowed border-outline-variant/20 bg-surface-container-lowest/50 opacity-40'
          : checked
            ? 'border-primary bg-primary text-white hover:bg-primary/90'
            : 'border-outline-variant/30 bg-transparent text-transparent hover:border-primary/50',
      ].join(' ')}
    >
      <span className="material-symbols-outlined text-[13px] font-bold">check</span>
    </button>
  )
}
